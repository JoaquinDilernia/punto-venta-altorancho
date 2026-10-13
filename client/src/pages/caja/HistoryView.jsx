import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { formatMoney } from '../../lib/labels.js';
import { formatDateTime, monthOptions } from '../../lib/format.js';
import { EmptyState, Notice, OrderStatusChip } from '../../components/ui.jsx';
import styles from './caja.module.css';

const STATUS_FILTERS = [
  { value: 'todos', label: 'Todos' },
  { value: 'pendiente', label: 'En caja' },
  { value: 'confirmado', label: 'Confirmados' },
  { value: 'error', label: 'Con error' },
  { value: 'anulado', label: 'Anulados' },
];

// Ventas del mes del local, con filtros. Abrir una fila va al detalle (lo maneja CajaPanel).
export default function HistoryView({ config, onOpen }) {
  const months = useMemo(() => monthOptions(6), []);
  const [month, setMonth] = useState(months[0].value);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('todos');
  const [search, setSearch] = useState('');
  const seq = useRef(0);

  const load = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    setError('');
    try {
      const found = await api(`/history?months=${month}`);
      if (id === seq.current) setOrders(found);
    } catch (err) {
      if (id === seq.current) { setOrders([]); setError(`No se pudo cargar el historial: ${err.message}`); }
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [month]);

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
      .filter((o) => !q
        || (o.number ?? '').toLowerCase().includes(q)
        || (o.odooOrderName ?? '').toLowerCase().includes(q)
        || (o.invoiceName ?? '').toLowerCase().includes(q)
        || (o.customer?.name ?? '').toLowerCase().includes(q)
        || (o.customer?.docNumber ?? '').includes(q));
  }, [orders, status, search]);

  return (
    <div className={styles.view}>
      <header className={styles.viewHead}>
        <h1 className={styles.viewTitle}>Historial</h1>
        <div className={styles.toolbar}>
          <select className="select" aria-label="Mes" value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
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
                <th>Número</th><th>Fecha</th><th>Vendedor</th><th>Cliente</th><th className={styles.right}>Total</th>
                <th>Medio</th><th>Estado</th><th>Odoo</th><th>Factura</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((o) => (
                <tr key={o.id} tabIndex={0} onClick={() => onOpen(o.id)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(o.id); }}>
                  <td className="num"><strong>{o.number}</strong></td>
                  <td className="num">{formatDateTime(o.confirmedAt ?? o.sentAt ?? o.createdAt)}</td>
                  <td>{o.sellerName}</td>
                  <td>{o.customer?.name ?? '—'}</td>
                  <td className={`${styles.right} num`}>{o.totals?.total != null ? formatMoney(o.totals.total) : '—'}</td>
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
