import { Fragment, useState } from 'react';
import { formatMoney } from '../../lib/labels.js';
import { formatDateTime } from '../../lib/format.js';
import { Chip, EmptyState, Notice } from '../../components/ui.jsx';
import { useApiData } from './adminParts.jsx';
import styles from './admin.module.css';

const TYPE_LABELS = { gasto: 'Gasto', retiro: 'Retiro', ingreso_usd: 'Dólares' };
const usd = (n) => `US$ ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(n ?? 0)}`;

function Detail({ session, methodName }) {
  const summary = session.summary;
  const movements = session.movements ?? [];
  return (
    <div className={styles.sessionDetail}>
      <div>
        <h3 className={styles.cardTitle}>Resumen por medio de pago</h3>
        {summary ? (
          <div className={styles.kv}>
            {Object.entries(summary.byMethod ?? {}).map(([id, amount]) => (
              <div key={id}><span>{methodName(id)}</span><span className="num">{formatMoney(amount)}</span></div>
            ))}
            {Object.keys(summary.byMethod ?? {}).length === 0 && <p className={styles.muted}>Sin ventas.</p>}
            <div><strong>Total vendido ({summary.sales} {summary.sales === 1 ? 'venta' : 'ventas'})</strong><strong className="num">{formatMoney(summary.total)}</strong></div>
            <div><span>Fondo inicial</span><span className="num">{formatMoney(summary.openingCash)}</span></div>
            <div><span>Gastos</span><span className="num">− {formatMoney(summary.expenses)}</span></div>
            <div><span>Retiros</span><span className="num">− {formatMoney(summary.withdrawals)}</span></div>
            {summary.usd?.amount > 0 && <div><span>Dólares recibidos</span><span className="num">{usd(summary.usd.amount)} ≈ {formatMoney(summary.usd.pesos)}</span></div>}
          </div>
        ) : (
          <p className={styles.muted}>La caja sigue abierta: el resumen se calcula al cerrarla.</p>
        )}
        {session.notes ? <p style={{ marginTop: 'var(--s-3)' }}><strong>Notas:</strong> {session.notes}</p> : null}
      </div>
      <div>
        <h3 className={styles.cardTitle}>Movimientos</h3>
        {movements.length === 0 && <p className={styles.muted}>Sin movimientos.</p>}
        <div className={styles.kv}>
          {movements.map((m) => (
            <div key={m.id} className={m.voidedAt ? styles.voided : ''}>
              <span>
                {TYPE_LABELS[m.type] ?? m.type} · {m.concept}
                <span className={styles.muted}> · {formatDateTime(m.at)} · {m.by}{m.type === 'ingreso_usd' ? ` · ${usd(m.usdAmount)} a ${formatMoney(m.rate)}` : ''}{m.voidedAt ? ` · anulado por ${m.voidedBy}` : ''}</span>
              </span>
              <span className="num">{formatMoney(m.amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function CashSessionsView() {
  const [localId, setLocalId] = useState('');
  const locales = useApiData('/admin/locales');
  const methods = useApiData('/admin/payment-methods');
  const sessions = useApiData(`/cash/sessions${localId ? `?localId=${encodeURIComponent(localId)}` : ''}`);
  const [openId, setOpenId] = useState(null);

  const localName = (id) => locales.data?.find((l) => l.id === id)?.name ?? id;
  const methodName = (id) => methods.data?.find((m) => m.id === id)?.label ?? id;
  const list = sessions.data ?? [];

  return (
    <div className={styles.view}>
      <header className={styles.viewHead}>
        <h1 className={styles.viewTitle}>Cajas</h1>
        <div className={styles.toolbar}>
          <select className="select" aria-label="Local" value={localId} onChange={(e) => { setLocalId(e.target.value); setOpenId(null); }}>
            <option value="">Todos los locales</option>
            {(locales.data ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <button type="button" className="btn btn-secondary" onClick={sessions.reload}>Actualizar</button>
        </div>
      </header>
      <Notice kind="error">{sessions.error || locales.error || methods.error}</Notice>
      {sessions.loading && <p className={styles.muted}>Cargando…</p>}
      {!sessions.loading && !sessions.error && list.length === 0 && <EmptyState title="Todavía no hay cajas para mostrar" />}
      {list.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={`${styles.table} ${styles.clickable}`}>
            <thead>
              <tr>
                <th>Local</th><th>Apertura</th><th>Cierre</th><th>Abrió / cerró</th><th className={styles.right}>Fondo</th>
                <th className={styles.right}>Esperado</th><th className={styles.right}>Contado</th><th className={styles.right}>Diferencia</th><th>Notas</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => {
                const open = openId === s.id;
                const diff = s.summary?.difference;
                return (
                  <Fragment key={s.id}>
                    <tr tabIndex={0} aria-expanded={open} onClick={() => setOpenId(open ? null : s.id)} onKeyDown={(e) => { if (e.key === 'Enter') setOpenId(open ? null : s.id); }}>
                      <td><strong>{localName(s.localId)}</strong></td>
                      <td className="num">{formatDateTime(s.openedAt)}</td>
                      <td className="num">{s.status === 'cerrada' ? formatDateTime(s.closedAt) : <Chip tone="pending">Abierta</Chip>}</td>
                      <td>{s.openedBy}{s.closedBy ? ` / ${s.closedBy}` : ''}</td>
                      <td className={`${styles.right} num`}>{formatMoney(s.openingCash)}</td>
                      <td className={`${styles.right} num`}>{s.summary ? formatMoney(s.summary.expectedCash) : '—'}</td>
                      <td className={`${styles.right} num`}>{s.countedCash != null ? formatMoney(s.countedCash) : '—'}</td>
                      <td className={`${styles.right} num ${diff == null ? '' : diff === 0 ? styles.diffOk : styles.diffBad}`}>{diff == null ? '—' : formatMoney(diff)}</td>
                      <td className={styles.wrapCell}>{s.notes || '—'}</td>
                    </tr>
                    {open && <tr><td colSpan={9} style={{ padding: 0 }}><Detail session={s} methodName={methodName} /></td></tr>}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
