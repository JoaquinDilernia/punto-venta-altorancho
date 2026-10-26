import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { formatMoney, ORDER_STATUS } from '../../lib/labels.js';
import { formatDateTime, monthOptions, toMs } from '../../lib/format.js';
import { EmptyState, Notice, OrderStatusChip } from '../../components/ui.jsx';
import { useApiData } from './adminParts.jsx';
import { KindTag } from '../caja/lineParts.jsx';
import { KIND_LABELS } from '../../lib/returns.js';
import cajaStyles from '../caja/caja.module.css';
import styles from './admin.module.css';

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

const fullDate = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires',
});
const saleMs = (o) => toMs(o.confirmedAt ?? o.sentAt ?? o.createdAt);

// Celdas del CSV entre comillas; separador ";" y BOM para que Excel (es-AR) lo abra bien.
// Las celdas que empiezan con = + - @ se prefijan con ' para que Excel no las tome como fórmula.
const csvCell = (v) => {
  const text = String(v ?? '');
  const safe = /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

export default function AdminHistoryView() {
  const months = useMemo(() => monthOptions(6), []);
  const locales = useApiData('/admin/locales');
  const methods = useApiData('/admin/payment-methods');
  const [month, setMonth] = useState(months[0].value);
  const [localId, setLocalId] = useState('');
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
      const found = await api(`/history?months=${month}${localId ? `&localId=${encodeURIComponent(localId)}` : ''}`);
      if (id === seq.current) setOrders(found);
    } catch (err) {
      if (id === seq.current) { setOrders([]); setError(`No se pudo cargar el historial: ${err.message}`); }
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [month, localId]);
  useEffect(() => { load(); }, [load]);

  const localName = (id) => locales.data?.find((l) => l.id === id)?.name ?? id ?? '—';
  const paymentText = (o) => (o.payments ?? []).map((p) => {
    const m = methods.data?.find((x) => x.id === p.methodId);
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
        || (o.sellerName ?? '').toLowerCase().includes(q)
        || (o.customer?.name ?? '').toLowerCase().includes(q)
        || (o.customer?.docNumber ?? '').includes(q))
      .sort((a, b) => (saleMs(b) ?? 0) - (saleMs(a) ?? 0));
  }, [orders, status, kind, search]);

  function exportCsv() {
    const header = ['Número', 'Tipo', 'Fecha', 'Local', 'Vendedor', 'Cliente', 'Documento', 'Total', 'Medio de pago', 'Detalle', 'Pedido Odoo', 'Factura', 'Estado'];
    const rows = visible.map((o) => {
      const ms = saleMs(o);
      const detail = (o.lines ?? []).filter((l) => l.status !== 'eliminado').map((l) => `${l.qty} x ${l.name}`).join(' | ');
      return [
        o.number, KIND_LABELS[o.kind ?? 'venta'] ?? o.kind, ms == null ? '' : fullDate.format(ms), localName(o.localId), o.sellerName, o.customer?.name, o.customer?.docNumber,
        o.totals?.total != null ? String(o.totals.total).replace('.', ',') : '', paymentText(o), detail, o.odooOrderName, o.invoiceName,
        ORDER_STATUS[o.status]?.label ?? o.status,
      ];
    });
    const csv = `﻿${[header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `historial-${month}${localId ? `-${localId}` : ''}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={styles.view}>
      <header className={styles.viewHead}>
        <h1 className={styles.viewTitle}>Historial</h1>
        <div className={styles.toolbar}>
          <select className="select" aria-label="Local" value={localId} onChange={(e) => setLocalId(e.target.value)}>
            <option value="">Todos los locales</option>
            {(locales.data ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select className="select" aria-label="Mes" value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <label className={styles.toolbar}>
            <span className={styles.muted}>Tipo</span>
            <select className="select" aria-label="Tipo de operación" value={kind} onChange={(e) => setKind(e.target.value)}>
              {KIND_FILTERS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </label>
          <input className={`input ${styles.searchInput}`} type="search" placeholder="Número, cliente, vendedor, S0… o factura" aria-label="Buscar venta" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button type="button" className="btn btn-secondary" onClick={load}>Actualizar</button>
          <button type="button" className="btn btn-primary" onClick={exportCsv} disabled={visible.length === 0}>Exportar CSV</button>
        </div>
      </header>

      <div className={styles.filters}>
        {STATUS_FILTERS.map((f) => (
          <button key={f.value} type="button" className={`${styles.filter} ${status === f.value ? styles.filterOn : ''}`} aria-pressed={status === f.value} onClick={() => setStatus(f.value)}>{f.label}</button>
        ))}
      </div>

      <Notice kind="error">{error || locales.error || methods.error}</Notice>
      {loading && <p className={styles.muted}>Cargando…</p>}
      {!loading && !error && visible.length === 0 && <EmptyState title="No hay ventas para mostrar">Probá con otro mes, local, filtro o búsqueda.</EmptyState>}

      {visible.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Número</th><th>Fecha</th><th>Local</th><th>Vendedor</th><th>Cliente</th><th className={styles.right}>Total</th>
                <th>Medio</th><th>Estado</th><th>Odoo</th><th>Factura</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((o) => (
                <tr key={o.id}>
                  <td className="num"><span className={cajaStyles.numberCell}><strong>{o.number}</strong><KindTag kind={o.kind} /></span></td>
                  <td className="num">{formatDateTime(o.confirmedAt ?? o.sentAt ?? o.createdAt)}</td>
                  <td>{localName(o.localId)}</td>
                  <td>{o.sellerName}</td>
                  <td className={styles.wrapCell}>{o.customer?.name ?? '—'}</td>
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
