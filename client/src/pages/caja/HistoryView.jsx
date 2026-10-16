import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { formatMoney } from '../../lib/labels.js';
import { formatDateTime, monthOptions } from '../../lib/format.js';
import { EmptyState, Notice, OrderStatusChip } from '../../components/ui.jsx';
import { KindTag } from './lineParts.jsx';
import styles from './caja.module.css';

const STATUS_FILTERS = [
  { value: 'todos', label: 'Todos' },
  { value: 'pendiente', label: 'En caja' },
  { value: 'confirmado', label: 'Confirmados' },
  { value: 'error', label: 'Con error' },
  { value: 'anulado', label: 'Anulados' },
];
const KIND_FILTERS = [
  { value: 'todas', label: 'Todas' },
  { value: 'venta', label: 'Ventas' },
  { value: 'cambio', label: 'Cambios' },
  { value: 'devolucion', label: 'Devoluciones' },
];

// Ventas del mes del local, con filtros. Abrir una fila va al detalle (lo maneja CajaPanel).
export default function HistoryView({ config, scope, onOpen }) {
  const months = useMemo(() => monthOptions(6), []);
  const [month, setMonth] = useState(months[0].value);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('todos');
  const [kind, setKind] = useState('todas');
  const [search, setSearch] = useState('');
  const seq = useRef(0);

  const load = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    setError('');
    try {
      const found = await api(`/history?months=${month}${scope ? `&localId=${encodeURIComponent(scope)}` : ''}`);
      if (id === seq.current) setOrders(found);
    } catch (err) {
      if (id === seq.current) { setOrders([]); setError(`No se pudo cargar el historial: ${err.message}`); }
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [month, scope]);

  useEffect(() => { load(); }, [load]);

  const methodById = useMemo(() => new Map((config.paymentMethods ?? []).map((m) => [m.id, m])), [config]);
  const paymentText = (o) => (o.payments ?? []).map((p) => {
    const m = methodById.get(p.methodId);
    const d = m?.details?.find((x) => x.id === p.detailId);
    return `${m?.label ?? p.methodId}${d ? ` ${d.label}` : ''}`;
  }).join(' + ') || '—';

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders
      .filter((o) => status === 'todos' || o.status === status)
      .filter((o) => kind === 'todas' || (o.kind ?? 'venta') === kind)
      .filter((o) => !q
        || (o.number ?? '').toLowerCase().includes(q)
        || (o.odooOrderName ?? '').toLowerCase().includes(q)
        || (o.invoiceName ?? '').toLowerCase().includes(q)
        || (o.customer?.name ?? '').toLowerCase().includes(q)
        || (o.customer?.docNumber ?? '').includes(q));
  }, [orders, status, kind, search]);

  return (
    <div className={styles.view}>
      <header className={styles.viewHead}>
        <h1 className={styles.viewTitle}>Historial</h1>
        <div className={styles.toolbar}>
          <select className="select" aria-label="Mes" value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <label className={styles.toolbar}>
            <span className={styles.muted}>Tipo</span>
            <select className="select" aria-label="Tipo de operación" value={kind} onChange={(e) => setKind(e.target.value)}>
              {KIND_FILTERS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </label>
          <input className={`input ${styles.searchInput}`} type="search" placeholder="Número, cliente, S0… o factura" aria-label="Buscar venta" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button type="button" className="btn btn-secondary" onClick={load}>Actualizar</button>
        </div>
      </header>

      <div className={styles.filters}>
        {STATUS_FILTERS.map((f) => (
          <button key={f.value} type="button" className={`${styles.filter} ${status === f.value ? styles.filterOn : ''}`} aria-pressed={status === f.value} onClick={() => setStatus(f.value)}>{f.label}</button>
        ))}
      </div>

      <Notice kind="error">{error}</Notice>
      {loading && <p className={styles.muted}>Cargando…</p>}
      {!loading && !error && visible.length === 0 && <EmptyState title="No hay ventas para mostrar">Probá con otro mes, filtro o búsqueda.</EmptyState>}

      {visible.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Número</th><th>Fecha</th><th>Vendedor</th><th>Cliente</th><th className={styles.right} title="En cambios y devoluciones, el neto">Total / neto</th>
                <th>Medio</th><th>Estado</th><th>Odoo</th><th>Factura</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((o) => (
                <tr key={o.id} tabIndex={0} onClick={() => onOpen(o.id)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(o.id); }}>
                  <td className="num"><span className={styles.numberCell}><strong>{o.number}</strong><KindTag kind={o.kind} /></span></td>
                  <td className="num">{formatDateTime(o.confirmedAt ?? o.sentAt ?? o.createdAt)}</td>
                  <td>{o.sellerName}</td>
                  <td>{o.customer?.name ?? '—'}</td>
                  <td className={`${styles.right} num`}>{o.totals ? formatMoney(o.totals.net ?? o.totals.total) : '—'}</td>
                  <td>{paymentText(o)}</td>
                  <td><OrderStatusChip status={o.status} /></td>
                  <td className="num">{o.odooOrderName || '—'}</td>
                  <td className="num">{o.invoiceName || (o.invoiceError ? 'Con error' : '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
