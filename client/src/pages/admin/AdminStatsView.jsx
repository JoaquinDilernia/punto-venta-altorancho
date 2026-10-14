import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { formatMoney } from '../../lib/labels.js';
import { EmptyState, Notice } from '../../components/ui.jsx';
import { useApiData } from './adminParts.jsx';
import styles from './admin.module.css';

const RANGES = [
  { value: 'hoy', label: 'Hoy' },
  { value: 'semana', label: 'Esta semana' },
  { value: 'mes', label: 'Este mes' },
  { value: 'mes_anterior', label: 'Mes anterior' },
  { value: 'custom', label: 'Personalizado' },
];

const DAY = 24 * 60 * 60 * 1000;
// Medianoche de Argentina (UTC-3, sin horario de verano) de un día y/m/d.
const argMidnight = (y, m, d) => Date.UTC(y, m, d, 3);

// { from, to } en ms; `to` es exclusivo. Null si el rango personalizado está incompleto.
function rangeFor(kind, custom) {
  const now = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  if (kind === 'hoy') return { from: argMidnight(y, m, d), to: argMidnight(y, m, d + 1) };
  if (kind === 'semana') {
    const sinceMonday = (now.getUTCDay() + 6) % 7;
    return { from: argMidnight(y, m, d - sinceMonday), to: argMidnight(y, m, d - sinceMonday + 7) };
  }
  if (kind === 'mes') return { from: argMidnight(y, m, 1), to: argMidnight(y, m + 1, 1) };
  if (kind === 'mes_anterior') return { from: argMidnight(y, m - 1, 1), to: argMidnight(y, m, 1) };
  if (!custom.from || !custom.to) return null;
  const [fy, fm, fd] = custom.from.split('-').map(Number);
  const [ty, tm, td] = custom.to.split('-').map(Number);
  return { from: argMidnight(fy, fm - 1, fd), to: argMidnight(ty, tm - 1, td) + DAY };
}

function Bars({ rows, labelHead, valueHead = 'Total', empty = 'Sin ventas en el período.' }) {
  const max = Math.max(...rows.map((r) => r.total), 0);
  if (rows.length === 0) return <p className={styles.muted}>{empty}</p>;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead><tr><th>{labelHead}</th>{rows.some((r) => r.sales != null) && <th className={styles.right}>Ventas</th>}<th className={styles.right}>{valueHead}</th><th /></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{r.label}{r.sub && <span className={styles.muted}> · {r.sub}</span>}</td>
              {rows.some((x) => x.sales != null) && <td className={`${styles.right} num`}>{r.sales ?? ''}</td>}
              <td className={`${styles.right} num`}>{formatMoney(r.total)}</td>
              <td><div className={styles.bar}><div className={styles.barFill} style={{ width: `${max > 0 ? (r.total / max) * 100 : 0}%` }} /></div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminStatsView() {
  const locales = useApiData('/admin/locales');
  const methods = useApiData('/admin/payment-methods');
  const [kind, setKind] = useState('mes');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [localId, setLocalId] = useState('');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const seq = useRef(0);

  useEffect(() => {
    const range = rangeFor(kind, custom);
    setError('');
    if (!range) { setStats(null); setLoading(false); return undefined; }
    if (range.to <= range.from) { setStats(null); setLoading(false); setError('La fecha "hasta" es anterior a "desde"'); return undefined; }
    const id = ++seq.current;
    setLoading(true);
    setError('');
    const query = `from=${encodeURIComponent(new Date(range.from).toISOString())}&to=${encodeURIComponent(new Date(range.to).toISOString())}${localId ? `&localId=${encodeURIComponent(localId)}` : ''}`;
    api(`/admin/stats?${query}`)
      .then((s) => { if (id === seq.current) setStats(s); })
      .catch((err) => { if (id === seq.current) { setStats(null); setError(`No se pudieron cargar las estadísticas: ${err.message}`); } })
      .finally(() => { if (id === seq.current) setLoading(false); });
    return () => { seq.current += 1; };
  }, [kind, custom, localId]);

  const localName = (id) => locales.data?.find((l) => l.id === id)?.name ?? id;
  const methodName = (id) => methods.data?.find((m) => m.id === id)?.label ?? id;

  const byLocal = (stats?.byLocal ?? []).map((r) => ({ key: r.localId, label: localName(r.localId), sales: r.sales, total: r.total }));
  const bySeller = (stats?.bySeller ?? []).map((r) => ({ key: r.sellerId, label: r.sellerName, sub: localName(r.localId), sales: r.sales, total: r.total }));
  const byMethod = Object.entries(stats?.byMethod ?? {}).map(([id, total]) => ({ key: id, label: methodName(id), total })).sort((a, b) => b.total - a.total);
  const top = (stats?.topProducts ?? []).map((r) => ({ key: r.sku, label: r.name, sub: `${r.sku} · ${r.qty} u.`, total: r.total }));

  return (
    <div className={styles.view}>
      <header className={styles.viewHead}>
        <h1 className={styles.viewTitle}>Estadísticas</h1>
        <select className="select" aria-label="Local" value={localId} onChange={(e) => setLocalId(e.target.value)}>
          <option value="">Todos los locales</option>
          {(locales.data ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </header>

      <div className={styles.filters}>
        {RANGES.map((r) => (
          <button key={r.value} type="button" className={`${styles.filter} ${kind === r.value ? styles.filterOn : ''}`} aria-pressed={kind === r.value} onClick={() => setKind(r.value)}>{r.label}</button>
        ))}
      </div>
      {kind === 'custom' && (
        <div className={styles.toolbar}>
          <label className="field"><span className="field-label">Desde</span><input className="input" type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} /></label>
          <label className="field"><span className="field-label">Hasta (inclusive)</span><input className="input" type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} /></label>
        </div>
      )}

      <Notice kind="error">{error || locales.error || methods.error}</Notice>
      {loading && <p className={styles.muted}>Cargando…</p>}
      {kind === 'custom' && !rangeFor(kind, custom) && <EmptyState title="Elegí las dos fechas" />}

      {stats && !loading && (
        <>
          <div className={styles.cards}>
            <div className={styles.stat}><span className={styles.statLabel}>Ventas</span><span className={`${styles.statValue} num`}>{stats.sales}</span></div>
            <div className={styles.stat}><span className={styles.statLabel}>Total (con IVA)</span><span className={`${styles.statValue} num`}>{formatMoney(stats.total)}</span></div>
            <div className={styles.stat}><span className={styles.statLabel}>Total sin IVA</span><span className={`${styles.statValue} num`}>{formatMoney(stats.net)}</span></div>
            <div className={styles.stat}><span className={styles.statLabel}>Ticket promedio</span><span className={`${styles.statValue} num`}>{formatMoney(stats.averageTicket)}</span></div>
          </div>
          <div className={styles.tables}>
            <section className={styles.card}><h2 className={styles.cardTitle}>Por local</h2><Bars rows={byLocal} labelHead="Local" /></section>
            <section className={styles.card}><h2 className={styles.cardTitle}>Por medio de pago</h2><Bars rows={byMethod} labelHead="Medio" /></section>
            <section className={styles.card}><h2 className={styles.cardTitle}>Por vendedor</h2><Bars rows={bySeller} labelHead="Vendedor" /></section>
            <section className={styles.card}><h2 className={styles.cardTitle}>Productos más vendidos</h2><Bars rows={top} labelHead="Producto" valueHead="Vendido (con IVA)" /></section>
          </div>
          <p className={styles.hint}>Los productos se miden con IVA, sin el costo de envío.</p>
        </>
      )}
    </div>
  );
}
