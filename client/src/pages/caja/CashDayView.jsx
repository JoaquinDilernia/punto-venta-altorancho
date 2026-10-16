import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { formatMoney } from '../../lib/labels.js';
import { formatDateTime, formatTime, round2 } from '../../lib/format.js';
import { Notice } from '../../components/ui.jsx';
import { parseMoney } from './money.js';
import styles from './caja.module.css';

const REFRESH_MS = 15 * 1000;
const EXPENSE_SHORTCUTS = ['Comida', 'Librería', 'Limpieza', 'Transporte'];
const TYPE_LABELS = { gasto: 'Gasto', retiro: 'Retiro', ingreso_usd: 'Dólares' };
const usd = (n) => `US$ ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(n ?? 0)}`;

function diffText(diff) {
  if (diff === 0) return 'Cierra justo';
  return `${diff > 0 ? '+ ' : ''}${formatMoney(diff)} ${diff < 0 ? '(falta)' : '(sobra)'}`;
}

// Resumen del día: un renglón por medio de pago (con las cuotas debajo), el total
// y el efectivo que tiene que haber en la caja.
function Summary({ summary, config }) {
  const methodRows = useMemo(() => {
    const known = (config.paymentMethods ?? []).map((m) => m.id);
    const ids = [...known, ...Object.keys(summary.byMethod ?? {}).filter((id) => !known.includes(id))];
    return ids.filter((id) => summary.byMethod?.[id] != null || known.includes(id));
  }, [config, summary]);
  const methodById = new Map((config.paymentMethods ?? []).map((m) => [m.id, m]));
  const refundIds = Object.keys(summary.refundsByMethod ?? {}).filter((id) => summary.refundsByMethod[id] > 0);

  return (
    <dl className={styles.summary}>
      <div><dt>Fondo inicial</dt><dd className="num">{formatMoney(summary.openingCash)}</dd></div>
      {methodRows.map((id) => {
        const m = methodById.get(id);
        const details = Object.entries(summary.byDetail ?? {}).filter(([key]) => key.startsWith(`${id}:`));
        return (
          <div key={id} className={styles.summaryGroup}>
            <div><dt>Ventas · {m?.label ?? id}</dt><dd className="num">{formatMoney(summary.byMethod?.[id] ?? 0)}</dd></div>
            {details.map(([key, amount]) => {
              const detailId = key.slice(id.length + 1);
              return <div key={key} className={styles.summarySub}><dt>{m?.details?.find((d) => d.id === detailId)?.label ?? detailId}</dt><dd className="num">{formatMoney(amount)}</dd></div>;
            })}
          </div>
        );
      })}
      {refundIds.map((id) => (
        <div key={`refund-${id}`}><dt>Reintegros · {methodById.get(id)?.label ?? id}</dt><dd className="num">− {formatMoney(summary.refundsByMethod[id])}</dd></div>
      ))}
      {refundIds.length > 0 && <div><dt>Total de reintegros</dt><dd className="num">− {formatMoney(summary.refundsTotal)}</dd></div>}
      <div className={styles.summaryTotal}>
        <dt>
          Total vendido{' '}
          <span className={styles.muted}>({summary.sales} {summary.sales === 1 ? 'venta' : 'ventas'}{summary.annulled ? `, ${summary.annulled} anulada${summary.annulled === 1 ? '' : 's'}` : ''})</span>
        </dt>
        <dd className="num">{formatMoney(summary.total)}</dd>
      </div>
      {summary.creditsIssued > 0 && (
        <div className={styles.summarySub}><dt>Saldos emitidos <span className={styles.muted}>(no es plata)</span></dt><dd className="num">{formatMoney(summary.creditsIssued)}</dd></div>
      )}
      {summary.creditsUsed > 0 && (
        <div className={styles.summarySub}><dt>Saldos usados <span className={styles.muted}>(no es plata)</span></dt><dd className="num">{formatMoney(summary.creditsUsed)}</dd></div>
      )}
      {summary.returns > 0 && <div><dt>Devoluciones y cambios</dt><dd className="num">{summary.returns}</dd></div>}
      <div><dt>Gastos en efectivo</dt><dd className="num">− {formatMoney(summary.expenses)}</dd></div>
      <div><dt>Retiros de dinero</dt><dd className="num">− {formatMoney(summary.withdrawals)}</dd></div>
      {summary.usd?.amount > 0 && (
        <div><dt>Dólares recibidos <span className={styles.muted}>(no suman al efectivo en pesos)</span></dt><dd className="num">{usd(summary.usd.amount)} ≈ {formatMoney(summary.usd.pesos)}</dd></div>
      )}
      <div className={styles.summaryCash}>
        <dt>Efectivo que tiene que haber <span className={styles.muted}>(fondo + ventas en efectivo − reintegros en efectivo − gastos − retiros)</span></dt>
        <dd className="num">{formatMoney(summary.expectedCash)}</dd>
      </div>
      {summary.countedCash != null && (
        <>
          <div><dt>Efectivo contado</dt><dd className="num">{formatMoney(summary.countedCash)}</dd></div>
          <div><dt>Diferencia</dt><dd className={`num ${summary.difference === 0 ? styles.diffOk : styles.diffBad}`}>{diffText(summary.difference)}</dd></div>
        </>
      )}
    </dl>
  );
}

function Movements({ movements, busy, voidId, onAskVoid, onVoid, onCancelVoid }) {
  if (!movements?.length) return <p className={styles.muted}>Sin movimientos.</p>;
  return (
    <ul className={styles.movements}>
      {movements.map((m) => (
        <li key={m.id} className={`${styles.movement} ${m.voidedAt ? styles.voided : ''}`}>
          <span className={styles.movementType}>{TYPE_LABELS[m.type] ?? m.type}</span>
          <span className={styles.movementText}>
            {m.concept}
            <span className={styles.muted}>
              {' '}· {formatTime(m.at)} · {m.by}
              {m.type === 'ingreso_usd' ? ` · ${usd(m.usdAmount)} a ${formatMoney(m.rate)}` : ''}
              {m.voidedAt ? ` · anulado por ${m.voidedBy}` : ''}
            </span>
          </span>
          <span className="num">{m.type === 'ingreso_usd' ? '' : '− '}{formatMoney(m.amount)}</span>
          {onVoid && !m.voidedAt && (voidId === m.id ? (
            <span className={styles.rowActions}>
              <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => onVoid(m)}>Sí, anular</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onCancelVoid}>No</button>
            </span>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onAskVoid(m.id)}>Anular</button>
          ))}
        </li>
      ))}
    </ul>
  );
}

// Caja del día: abrir con el fondo, resumen por medio de pago, gastos / retiros /
// dólares, observación y cierre contando el efectivo.
export default function CashDayView({ config, scope, onChanged }) {
  const withScope = scope ? { localId: scope } : {};
  const [current, setCurrent] = useState(null); // { session, summary, lastClosed }
  const [error, setError] = useState('');
  const [notice, setNotice] = useState({ kind: 'success', text: '' });
  const [openingCash, setOpeningCash] = useState('');
  const [countedCash, setCountedCash] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);
  const [notes, setNotes] = useState('');
  const [movement, setMovement] = useState({ type: 'gasto', concept: '', amount: '', usdAmount: '', rate: '' });
  const [voidId, setVoidId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState(null); // resumen de la caja recién cerrada
  // El refresco no pisa la observación mientras se está escribiendo.
  const notesDirty = useRef(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const id = ++seq.current;
    try {
      const cur = await api(`/cash/current${scope ? `?localId=${encodeURIComponent(scope)}` : ''}`);
      if (id !== seq.current) return;
      setCurrent(cur);
      if (!notesDirty.current) setNotes(cur.session?.notes ?? '');
      setError('');
    } catch (err) {
      if (id === seq.current) setError(`No se pudo cargar la caja: ${err.message}`);
    }
  }, [scope]);

  useEffect(() => {
    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => clearInterval(interval);
  }, [load]);

  async function run(request, successText) {
    setBusy(true);
    setNotice({ kind: 'success', text: '' });
    try {
      const result = await request();
      await load();
      if (successText) setNotice({ kind: 'success', text: successText });
      return result ?? true;
    } catch (err) {
      setNotice({ kind: 'error', text: err.message });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function openCash(e) {
    e.preventDefault();
    const amount = parseMoney(openingCash);
    if (!amount.ok) { setNotice({ kind: 'error', text: 'Escribí el fondo inicial en pesos (puede ser 0), por ejemplo 20.000' }); return; }
    const ok = await run(() => api('/cash/open', { method: 'POST', body: { openingCash: amount.value, ...withScope } }), `Caja abierta con ${formatMoney(amount.value)} de fondo. Ya se pueden confirmar ventas.`);
    if (!ok) return;
    setOpeningCash('');
    setClosed(null);
    notesDirty.current = false;
    onChanged?.();
  }

  async function addMovement(e) {
    e.preventDefault();
    const { type, concept } = movement;
    const body = { type, concept: concept.trim() };
    if (type === 'gasto' && !body.concept) { setNotice({ kind: 'error', text: 'Escribí en qué se gastó (ej. comida, librería).' }); return; }
    if (type === 'ingreso_usd') {
      const dollars = parseMoney(movement.usdAmount);
      const rate = parseMoney(movement.rate);
      if (!dollars.ok || dollars.value <= 0) { setNotice({ kind: 'error', text: 'Escribí el monto en dólares.' }); return; }
      if (!rate.ok || rate.value <= 0) { setNotice({ kind: 'error', text: 'Escribí la cotización del dólar.' }); return; }
      body.usdAmount = dollars.value;
      body.rate = rate.value;
    } else {
      const amount = parseMoney(movement.amount);
      if (!amount.ok || amount.value <= 0) { setNotice({ kind: 'error', text: 'Escribí el monto que sale de la caja.' }); return; }
      body.amount = amount.value;
    }
    const ok = await run(() => api('/cash/movements', { method: 'POST', body: { ...body, ...withScope } }), `${TYPE_LABELS[type]} registrado.`);
    if (ok) setMovement((m) => ({ ...m, concept: '', amount: '', usdAmount: '', rate: '' }));
  }

  async function voidMovement(m) {
    setVoidId(null);
    await run(() => api(`/cash/movements/${m.id}/void`, { method: 'POST', body: scope ? { localId: scope } : undefined }), 'Movimiento anulado.');
  }

  async function saveNotes() {
    const ok = await run(() => api('/cash/notes', { method: 'PATCH', body: { notes, ...withScope } }), 'Observación guardada.');
    if (ok) notesDirty.current = false;
  }

  async function closeCash() {
    const counted = parseMoney(countedCash);
    if (!counted.ok) { setNotice({ kind: 'error', text: 'Contá el efectivo de la caja y escribí el monto.' }); setConfirmClose(false); return; }
    // La observación viaja con el cierre aunque no se haya guardado aparte.
    const result = await run(() => api('/cash/close', { method: 'POST', body: { countedCash: counted.value, notes, ...withScope } }));
    setConfirmClose(false);
    if (!result || result === true) return;
    setClosed(result.summary ?? null);
    setCountedCash('');
    notesDirty.current = false;
    setNotes('');
    onChanged?.();
  }

  const session = current?.session;
  const summary = current?.summary;
  const counted = parseMoney(countedCash);
  const liveDiff = summary && counted.ok ? round2(counted.value - summary.expectedCash) : null;
  const lastClosed = current?.lastClosed;

  return (
    <div className={`${styles.view} ${styles.cashView}`}>
      <header className={styles.viewHead}><h1 className={styles.viewTitle}>Caja del día</h1></header>
      <Notice kind="error">{error}</Notice>
      <Notice kind={notice.kind} onClose={notice.text ? () => setNotice({ kind: 'success', text: '' }) : undefined}>{notice.text}</Notice>

      {closed && !session && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Caja cerrada</h2>
          <p>Total vendido {formatMoney(closed.total)}.</p>
          <p className={`num ${closed.difference === 0 ? styles.diffOk : styles.diffBad}`}>Diferencia de efectivo: {diffText(closed.difference)}</p>
        </section>
      )}

      {current && !session && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>La caja está cerrada</h2>
          <p className={styles.muted}>Abrila para empezar el día: sin caja abierta no se pueden confirmar ventas.</p>
          {lastClosed && (
            <p>Último cierre ({formatDateTime(lastClosed.closedAt)}): efectivo contado <strong className="num">{formatMoney(lastClosed.countedCash)}</strong>.</p>
          )}
          <form className={styles.inlineForm} onSubmit={openCash}>
            <label className="field">
              <span className="field-label">Fondo inicial en efectivo</span>
              <input className="input num" inputMode="decimal" placeholder="Ej. 20.000" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} autoFocus />
            </label>
            <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>{busy ? 'Abriendo…' : 'Abrir caja'}</button>
          </form>
        </section>
      )}

      {session && summary && (
        <>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Caja abierta</h2>
            <p className={styles.muted}>Desde {formatDateTime(session.openedAt)} · abrió {session.openedBy}</p>
            <Summary summary={summary} config={config} />
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Movimientos</h2>
            <form className={styles.movementForm} onSubmit={addMovement}>
              <div className={styles.segmented} role="radiogroup" aria-label="Tipo de movimiento">
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <button key={value} type="button" role="radio" aria-checked={movement.type === value} className={movement.type === value ? styles.segmentOn : ''} onClick={() => setMovement((m) => ({ ...m, type: value }))}>
                    {value === 'retiro' ? 'Retiro de dinero' : value === 'ingreso_usd' ? 'Ingreso en dólares' : label}
                  </button>
                ))}
              </div>
              {movement.type === 'gasto' && (
                <div className={styles.rowActions}>
                  {EXPENSE_SHORTCUTS.map((c) => (
                    <button key={c} type="button" className={`btn btn-sm ${movement.concept === c ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setMovement((m) => ({ ...m, concept: c }))}>{c}</button>
                  ))}
                </div>
              )}
              <div className={styles.inlineForm}>
                <label className="field">
                  <span className="field-label">{movement.type === 'gasto' ? 'Concepto' : 'Detalle (opcional)'}</span>
                  <input className="input" maxLength={120} value={movement.concept} onChange={(e) => setMovement((m) => ({ ...m, concept: e.target.value }))} />
                </label>
                {movement.type === 'ingreso_usd' ? (
                  <>
                    <label className="field">
                      <span className="field-label">Monto en US$</span>
                      <input className="input num" inputMode="decimal" value={movement.usdAmount} onChange={(e) => setMovement((m) => ({ ...m, usdAmount: e.target.value }))} />
                    </label>
                    <label className="field">
                      <span className="field-label">Cotización ($ por US$)</span>
                      <input className="input num" inputMode="decimal" value={movement.rate} onChange={(e) => setMovement((m) => ({ ...m, rate: e.target.value }))} />
                    </label>
                  </>
                ) : (
                  <label className="field">
                    <span className="field-label">Monto ($)</span>
                    <input className="input num" inputMode="decimal" value={movement.amount} onChange={(e) => setMovement((m) => ({ ...m, amount: e.target.value }))} />
                  </label>
                )}
                <button type="submit" className="btn btn-secondary btn-lg" disabled={busy}>Registrar</button>
              </div>
            </form>
            <Movements movements={session.movements} busy={busy} voidId={voidId} onAskVoid={setVoidId} onVoid={voidMovement} onCancelVoid={() => setVoidId(null)} />
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Observación de la caja</h2>
            <textarea className="input" rows={2} maxLength={1000} value={notes} placeholder="Ej. faltante explicado, cambio que se pidió…" onChange={(e) => { notesDirty.current = true; setNotes(e.target.value); }} />
            <div><button type="button" className="btn btn-secondary btn-sm" disabled={busy || notes === (session.notes ?? '')} onClick={saveNotes}>Guardar observación</button></div>
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Cerrar la caja</h2>
            <label className="field">
              <span className="field-label">Efectivo contado en la caja</span>
              <input className="input num" inputMode="decimal" value={countedCash} placeholder={`Tendría que haber ${formatMoney(summary.expectedCash)}`} onChange={(e) => { setCountedCash(e.target.value); setConfirmClose(false); }} />
            </label>
            {liveDiff != null && <p className={`num ${liveDiff === 0 ? styles.diffOk : styles.diffBad}`}>Diferencia: {diffText(liveDiff)}</p>}
            {!confirmClose ? (
              <div><button type="button" className="btn btn-danger btn-lg" disabled={busy || !counted.ok} onClick={() => setConfirmClose(true)}>Cerrar caja</button></div>
            ) : (
              <div className={styles.confirmBox} role="alertdialog" aria-label="Cerrar la caja">
                <p>¿Cerrar la caja con {formatMoney(counted.value)} en efectivo? Después no se pueden confirmar ventas hasta abrir una nueva.</p>
                <div className={styles.rowActions}>
                  <button type="button" className="btn btn-secondary" onClick={() => setConfirmClose(false)}>No, volver</button>
                  <button type="button" className="btn btn-danger" disabled={busy} onClick={closeCash}>{busy ? 'Cerrando…' : 'Sí, cerrar caja'}</button>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
