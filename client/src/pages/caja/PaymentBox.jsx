import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { formatMoney } from '../../lib/labels.js';
import { round2 } from '../../lib/format.js';
import { Notice } from '../../components/ui.jsx';
import { moneyText, parseMoney } from './money.js';
import styles from './caja.module.css';

const SPLIT_WARNING = 'Con pago dividido se aplica el menor descuento de los medios elegidos';
const CONFIRM_NOUN = { venta: 'venta', cambio: 'cambio', devolucion: 'devolución' };

const keyOf = (payments) => JSON.stringify((payments ?? []).map((p) => [p.methodId, p.detailId ?? null, p.amount ?? null]));
const pct = (n) => `${String(n).replace('.', ',')} %`;

function MethodSelect({ methods, row, onChange, disabled }) {
  const method = methods.find((m) => m.id === row.methodId);
  return (
    <>
      <select className="select select-sm" aria-label="Medio de pago" value={row.methodId} disabled={disabled} onChange={(e) => onChange({ methodId: e.target.value, detailId: '' })}>
        <option value="">Medio…</option>
        {methods.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
      </select>
      {method?.details?.length > 0 && (
        <select className="select select-sm" aria-label="Detalle del medio de pago" value={row.detailId} disabled={disabled} onChange={(e) => onChange({ detailId: e.target.value })}>
          <option value="">Detalle…</option>
          {method.details.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
      )}
    </>
  );
}

// Cobro: medio de pago (simple o dividido), descuento extra, factura, desglose
// del servidor y "Confirmar venta". Los totales vienen SIEMPRE de `preview`
// (o de `order.totals` si el pedido ya no se puede cambiar).
// `onPatch(body)` devuelve la respuesta de `GET /orders/:id` posterior o null.
// En cambios cobra solo `collect` (la diferencia); sin nada para cobrar no pide
// medio de pago y muestra `children` (p. ej. RefundBox) en su lugar.
// `invoiceHint`: la compra que vuelve tenía factura y hay algo nuevo (para la NC).
export default function PaymentBox({
  order, preview, config, locale, busy, payError, editable, canConfirm, blockers, confirming, confirmError,
  onPatch, onConfirm, onGoCash, invoiceHint = false, children = null,
}) {
  const creditMethod = config.creditMethod ?? { id: 'saldo', label: 'Saldo a favor', discountPct: 0 };
  const saved = order.payments ?? [];

  // Saldo a favor del cliente: es un medio de pago más mientras alcance algo.
  const doc = String(order.customer?.docNumber ?? '').replace(/\D/g, '');
  const [credit, setCredit] = useState(null); // { balance } | null
  useEffect(() => {
    let alive = true;
    setCredit(null);
    if (!editable || doc.length < 7) return undefined;
    api(`/credits?doc=${doc}`).then((r) => alive && setCredit(r)).catch(() => {});
    return () => { alive = false; };
  }, [doc, editable]);
  const available = credit?.balance ?? 0;
  const savedSaldo = saved.some((p) => p.methodId === creditMethod.id);
  const withCredit = available > 0 || savedSaldo;
  const saldoMethod = { ...creditMethod, label: available > 0 ? `${creditMethod.label} (disponible ${formatMoney(available)})` : creditMethod.label };

  const methods = [
    ...(config.paymentMethods ?? []).filter((m) => m.active !== false && m.id !== creditMethod.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    ...(withCredit ? [saldoMethod] : []),
  ];
  const methodById = new Map([...(config.paymentMethods ?? []).map((m) => [m.id, m]), [creditMethod.id, saldoMethod]]);

  const [mode, setMode] = useState(saved.length > 1 ? 'split' : 'single');
  const [single, setSingle] = useState({ methodId: saved[0]?.methodId ?? '', detailId: saved[0]?.detailId ?? '' });
  const [rows, setRows] = useState(() => (saved.length > 1
    ? saved.map((p) => ({ methodId: p.methodId, detailId: p.detailId ?? '', amount: moneyText(p.amount) }))
    : []));
  const [splitError, setSplitError] = useState('');
  const [coupon, setCoupon] = useState('');
  const [discountError, setDiscountError] = useState('');

  const totals = preview?.totals ?? order.totals ?? null;
  const exchange = (order.returnLines ?? []).length > 0;
  const hasNewLines = (order.lines ?? []).some((l) => l.status !== 'eliminado');
  // Lo que se cobra: en un cambio, solo la diferencia.
  const due = totals ? (totals.collect ?? totals.total) : 0;
  const net = totals?.net ?? due;
  const noPayment = exchange && Boolean(totals) && due === 0;
  const extra = preview ? preview.extraDiscount : order.extraDiscount;
  const previewError = preview?.error ?? '';
  const disabled = busy || confirming;
  const invoicesOk = locale?.invoices !== false;

  // Un local que no factura no puede tener la factura pedida: se apaga una sola vez.
  const clearedInvoice = useRef(false);
  useEffect(() => {
    if (editable && !invoicesOk && order.wantsInvoice && !clearedInvoice.current) {
      clearedInvoice.current = true;
      onPatch({ wantsInvoice: false });
    }
  });

  const needsDetail = (id) => (methodById.get(id)?.details?.length ?? 0) > 0;
  const rowComplete = (r) => Boolean(r.methodId) && (!needsDetail(r.methodId) || Boolean(r.detailId));
  const rowsPayload = () => {
    const parsed = rows.map((r) => ({ r, amount: parseMoney(r.amount) }));
    if (rows.length < 2 || parsed.some(({ r, amount }) => !rowComplete(r) || !amount.ok || amount.value <= 0)) return null;
    return parsed.map(({ r, amount }) => ({ methodId: r.methodId, detailId: r.detailId || null, amount: round2(amount.value) }));
  };

  const desired = mode === 'single'
    ? (rowComplete(single) ? [{ methodId: single.methodId, detailId: single.detailId || null, amount: null }] : null)
    : rowsPayload();
  const paymentBlockers = [];
  const creditConsumed = Boolean(order.creditAllocation?.length);
  const saldoWanted = mode === 'single'
    ? (single.methodId === creditMethod.id ? due : 0)
    : rows.reduce((sum, r) => { const a = parseMoney(r.amount); return r.methodId === creditMethod.id && a.ok ? sum + a.value : sum; }, 0);
  if (editable && !noPayment) {
    if (!desired) {
      if (mode === 'split') paymentBlockers.push('Completá los medios y montos del pago dividido');
      else paymentBlockers.push(single.methodId && needsDetail(single.methodId) ? 'Elegí las cuotas' : 'Elegí el medio de pago');
    } else if (mode === 'split' && totals && Math.abs(round2(due - desired.reduce((sum, d) => sum + d.amount, 0))) >= 0.01) {
      paymentBlockers.push(`Los pagos tienen que sumar ${exchange ? 'lo que se cobra' : 'el total'} (${formatMoney(due)})`);
    } else if (!creditConsumed && credit && round2(saldoWanted) > available + 0.001) {
      paymentBlockers.push(`El saldo a favor alcanza para ${formatMoney(available)}: dividí el pago`);
    } else if (keyOf(desired) !== keyOf(saved)) {
      if (mode === 'split') paymentBlockers.push('Tocá "Aplicar pago dividido"');
      else paymentBlockers.push(busy ? 'Se está guardando el medio de pago' : 'No se guardó el medio de pago: volvé a elegirlo');
    }
  }
  const allBlockers = [...paymentBlockers, ...blockers];
  const confirmDisabled = disabled || !canConfirm || Boolean(previewError) || allBlockers.length > 0;

  // ---- Pago simple ----
  function chooseMethod(m) {
    setSingle({ methodId: m.id, detailId: '' });
    if (!m.details?.length) onPatch({ payments: [{ methodId: m.id, detailId: null }] });
  }
  function chooseDetail(detailId) {
    setSingle((s) => ({ ...s, detailId }));
    if (detailId) onPatch({ payments: [{ methodId: single.methodId, detailId }] });
  }

  // ---- Pago dividido ----
  function startSplit() {
    setSplitError('');
    setRows([{ ...single, amount: '' }, { methodId: '', detailId: '', amount: '' }]);
    setMode('split');
  }
  function endSplit() {
    setSplitError('');
    const first = rows.find(rowComplete);
    setMode('single');
    if (first) {
      setSingle({ methodId: first.methodId, detailId: first.detailId });
      onPatch({ payments: [{ methodId: first.methodId, detailId: first.detailId || null }] });
    } else {
      setSingle({ methodId: '', detailId: '' });
    }
  }
  const setRow = (i, change) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...change } : r)));
  const assigned = round2(rows.reduce((sum, r) => { const a = parseMoney(r.amount); return sum + (a.ok ? a.value : 0); }, 0));
  const rest = totals ? round2(due - assigned) : 0;
  // "Resto": lo que falta; con saldo, hasta lo disponible.
  function fillRest(i) {
    const others = rows.reduce((sum, r, idx) => { const a = idx === i ? { ok: false } : parseMoney(r.amount); return sum + (a.ok ? a.value : 0); }, 0);
    let amount = Math.max(0, due - others);
    if (rows[i].methodId === creditMethod.id && credit) amount = Math.min(amount, available);
    if (totals) setRow(i, { amount: moneyText(round2(amount)) });
  }
  async function applySplit() {
    const payload = rowsPayload();
    if (!payload) { setSplitError('Completá el medio, el detalle y un monto mayor a 0 en cada fila'); return; }
    setSplitError('');
    await onPatch({ payments: payload });
  }

  // ---- Descuento extra ----
  const promotions = (config.promotions ?? []).filter((p) => p.kind === 'motivo');
  async function setDiscount(choice) {
    setDiscountError('');
    const res = await onPatch({ discountChoice: choice });
    if (choice && res?.preview?.error) {
      setDiscountError(res.preview.error);
      await onPatch({ discountChoice: null });
    }
    if (choice?.code) setCoupon('');
  }

  const choice = order.discountChoice;
  const cuitNoIva = order.wantsInvoice && String(order.customer?.docNumber ?? '').replace(/\D/g, '').length === 11 && !order.customer?.afipResponsibility;
  return (
    <aside className={styles.payBox} aria-label="Cobro">
      <div className={styles.payBody}>
        <h2 className={styles.payTitle}>Cobro</h2>
        <Notice kind="error">{previewError && !choice ? previewError : ''}</Notice>
        <Notice kind="error">{payError}</Notice>

        {editable ? (
          <>
            {noPayment && (children ?? (
              <section className={styles.paySection}>
                <p className={styles.hint}>Lo que vuelve cubre lo nuevo: no hay nada para cobrar ni para devolver.</p>
              </section>
            ))}
            {!noPayment && (<>
            <section className={styles.paySection}>
              <h3 className={styles.sectionLabel}>Medio de pago{exchange ? ` (se cobra ${formatMoney(due)})` : ''}</h3>
              {withCredit && <p className={styles.hint}>Pagar con saldo no suma descuento de efectivo</p>}
              {mode === 'single' ? (
                <>
                  <div className={styles.methodGrid}>
                    {methods.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={`${styles.method} ${single.methodId === m.id ? styles.methodOn : ''}`}
                        aria-pressed={single.methodId === m.id}
                        disabled={disabled}
                        onClick={() => chooseMethod(m)}
                      >
                        {m.label}{m.discountPct > 0 && <small> −{pct(m.discountPct)}</small>}
                      </button>
                    ))}
                  </div>
                  {needsDetail(single.methodId) && (
                    <label className="field">
                      <span className="field-label">{methodById.get(single.methodId)?.label}: elegí</span>
                      <select className="select" value={single.detailId} disabled={disabled} onChange={(e) => chooseDetail(e.target.value)}>
                        <option value="">Elegí…</option>
                        {methodById.get(single.methodId).details.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                      </select>
                    </label>
                  )}
                  <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={startSplit}>Dividir pago</button>
                </>
              ) : (
                <>
                  <p className={styles.hint}>{SPLIT_WARNING}</p>
                  <p className={styles.hint}>El total se recalcula al aplicar: con pago dividido vale el menor descuento</p>
                  {rows.map((r, i) => (
                    <div key={i} className={styles.splitRow}>
                      <MethodSelect methods={methods} row={r} disabled={disabled} onChange={(change) => setRow(i, change)} />
                      <input className="input input-sm num" inputMode="decimal" aria-label="Monto" placeholder="Monto" value={r.amount} disabled={disabled} onChange={(e) => setRow(i, { amount: e.target.value })} />
                      {r.methodId === creditMethod.id
                        ? <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={() => fillRest(i)} title="Lo que falta, hasta el saldo disponible">Completar con saldo</button>
                        : <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={() => fillRest(i)} title="Completar con lo que falta">Resto</button>}
                      {rows.length > 2 && <button type="button" className="btn btn-ghost btn-sm" aria-label="Quitar fila" disabled={disabled} onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}>×</button>}
                    </div>
                  ))}
                  <p className={`${styles.assign} num ${rest === 0 ? styles.assignOk : styles.assignBad}`} role="status">
                    {rest === 0 ? 'Montos completos' : rest > 0 ? `Falta asignar ${formatMoney(rest)}` : `Sobra ${formatMoney(-rest)}`}
                  </p>
                  <Notice kind="error">{splitError}</Notice>
                  <div className={styles.rowActions}>
                    <button type="button" className="btn btn-secondary btn-sm" disabled={disabled || rows.length >= 4} onClick={() => setRows((prev) => [...prev, { methodId: '', detailId: '', amount: '' }])}>Agregar medio</button>
                    <button type="button" className="btn btn-primary btn-sm" disabled={disabled} onClick={applySplit}>Aplicar pago dividido</button>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={endSplit}>Pago simple</button>
                  </div>
                </>
              )}
            </section>

            <section className={styles.paySection}>
              <h3 className={styles.sectionLabel}>Descuento extra</h3>
              <select
                className="select"
                aria-label="Motivo de descuento"
                value={choice?.promotionId ?? ''}
                disabled={disabled}
                onChange={(e) => setDiscount(e.target.value ? { promotionId: e.target.value } : null)}
              >
                <option value="">Sin descuento elegido</option>
                {promotions.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.type === 'pct' ? pct(p.value) : formatMoney(p.value)})</option>)}
              </select>
              <div className={styles.couponRow}>
                <input className="input input-sm" aria-label="Cupón" placeholder="Cupón" value={coupon} disabled={disabled} onChange={(e) => setCoupon(e.target.value)} />
                <button type="button" className="btn btn-secondary btn-sm" disabled={disabled || !coupon.trim()} onClick={() => setDiscount({ code: coupon.trim() })}>Aplicar</button>
              </div>
              {choice?.code && <p className={styles.hint}>Cupón {choice.code} elegido. <button type="button" className={styles.linkBtn} disabled={disabled} onClick={() => setDiscount(null)}>Quitar</button></p>}
              {choice && previewError && (
                <>
                  <Notice kind="error">{previewError}</Notice>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={disabled} onClick={() => setDiscount(null)}>Quitar descuento elegido</button>
                </>
              )}
              <Notice kind="error">{discountError}</Notice>
              {extra && !choice && <p className={styles.autoNote}>Aplicado automáticamente: {extra.name} {extra.type === 'pct' ? pct(extra.value) : formatMoney(extra.value)}</p>}
            </section>
            </>)}

            {(!exchange || hasNewLines) && (
              <section className={styles.paySection}>
                <label className={`${styles.switch} ${!invoicesOk ? styles.switchOff : ''}`}>
                  <input type="checkbox" role="switch" checked={Boolean(order.wantsInvoice) && invoicesOk} disabled={disabled || !invoicesOk} onChange={(e) => onPatch({ wantsInvoice: e.target.checked })} />
                  <span>¿Quiere factura?</span>
                </label>
                {!invoicesOk && <p className={styles.hint}>Este local todavía no factura desde el sistema</p>}
                {invoiceHint && invoicesOk && <p className={styles.hint}>Hace falta factura para aplicar la nota de crédito</p>}
                {cuitNoIva && <Notice kind="info">Buscá el CUIT en ARCA para saber si es A o B</Notice>}
              </section>
            )}
          </>
        ) : (
          <section className={styles.paySection}>
            <h3 className={styles.sectionLabel}>Medio de pago</h3>
            {saved.length === 0 && <p className={styles.hint}>{exchange ? 'Sin cobro' : 'Sin datos de pago'}</p>}
            {saved.map((p) => {
              const m = methodById.get(p.methodId);
              const d = m?.details?.find((x) => x.id === p.detailId);
              return (
                <p key={`${p.methodId}:${p.detailId ?? ''}`} className={styles.payLine}>
                  <span>{m?.label ?? p.methodId}{d ? ` · ${d.label}` : ''}</span>
                  {p.amount != null && <strong className="num">{formatMoney(p.amount)}</strong>}
                </p>
              );
            })}
            {(order.refund?.cashBack ?? []).map((c) => (
              <p key={`r:${c.methodId}`} className={styles.payLine}>
                <span>Reintegro · {methodById.get(c.methodId)?.label ?? c.methodId}</span>
                <strong className="num">{formatMoney(c.amount)}</strong>
              </p>
            ))}
            {order.refund?.credit > 0 && (
              <p className={styles.payLine}><span>Saldo a favor generado</span><strong className="num">{formatMoney(order.refund.credit)}</strong></p>
            )}
            {extra && <p className={styles.autoNote}>Descuento extra: {extra.name}</p>}
            <p className={styles.hint}>{order.wantsInvoice ? 'Con factura' : 'Sin factura'}</p>
          </section>
        )}

        {totals && !exchange && (
          <dl className={styles.breakdown}>
            <div><dt>Productos</dt><dd className="num">{formatMoney(totals.products)}</dd></div>
            <div><dt>Descuento medio de pago{totals.paymentPct > 0 ? ` (${pct(totals.paymentPct)})` : ''}</dt><dd className="num">− {formatMoney(totals.paymentDiscount)}</dd></div>
            <div className={styles.bold}><dt>Subtotal</dt><dd className="num">{formatMoney(totals.subtotal)}</dd></div>
            {extra && <div><dt>Descuento extra ({extra.name})</dt><dd className="num">− {formatMoney(totals.extraDiscount)}</dd></div>}
            {totals.shipping > 0 && <div><dt>Envío</dt><dd className="num">+ {formatMoney(totals.shipping)}</dd></div>}
            {totals.homeService > 0 && <div><dt>Subida al domicilio</dt><dd className="num">+ {formatMoney(totals.homeService)}</dd></div>}
          </dl>
        )}
        {totals && exchange && (
          <dl className={styles.breakdown}>
            {hasNewLines && <div><dt>Productos nuevos</dt><dd className="num">{formatMoney(totals.products)}</dd></div>}
            {totals.paymentDiscount > 0 && <div><dt>Descuento medio de pago{totals.paymentPct > 0 ? ` (${pct(totals.paymentPct)} sobre la diferencia)` : ''}</dt><dd className="num">− {formatMoney(totals.paymentDiscount)}</dd></div>}
            {extra && totals.extraDiscount > 0 && <div><dt>Descuento extra ({extra.name})</dt><dd className="num">− {formatMoney(totals.extraDiscount)}</dd></div>}
            {totals.shipping > 0 && <div><dt>Envío</dt><dd className="num">+ {formatMoney(totals.shipping)}</dd></div>}
            {totals.homeService > 0 && <div><dt>Subida al domicilio</dt><dd className="num">+ {formatMoney(totals.homeService)}</dd></div>}
            <div className={styles.bold}><dt>Se lleva</dt><dd className="num">{formatMoney(totals.total)}</dd></div>
            <div><dt>Vuelve</dt><dd className="num">− {formatMoney(totals.returnValue)}</dd></div>
            <div className={styles.bold}><dt>Neto</dt><dd className="num">{formatMoney(net)}</dd></div>
          </dl>
        )}
      </div>

      <div className={styles.payFooter}>
        <div className={styles.totalRow}>
          <span>{exchange ? (net < 0 ? 'A devolver' : 'A cobrar') : 'Total'}</span>
          <strong className={`${styles.total} num`}>{totals ? formatMoney(exchange ? Math.abs(net) : totals.total) : '—'}</strong>
        </div>
        {confirmError && (
          <div className={styles.confirmError} role="alert">
            <p>{confirmError.message}</p>
            {confirmError.cashClosed && <button type="button" className="btn btn-secondary btn-sm" onClick={onGoCash}>Ir a Caja del día</button>}
          </div>
        )}
        {canConfirm && (
          <>
            <button type="button" className="btn btn-primary btn-lg btn-block" disabled={confirmDisabled} onClick={onConfirm}>
              {confirming ? 'Confirmando en Odoo…' : order.status === 'error' ? 'Reintentar confirmación' : `Confirmar ${CONFIRM_NOUN[order.kind] ?? 'venta'}`}
            </button>
            {!confirming && allBlockers.length > 0 && <p className={styles.hint}>{allBlockers.join(' · ')}</p>}
          </>
        )}
      </div>
    </aside>
  );
}
