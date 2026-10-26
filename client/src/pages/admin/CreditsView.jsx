import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { formatMoney } from '../../lib/labels.js';
import { formatDateTime, toMs } from '../../lib/format.js';
import { digitsOf } from '../../lib/returns.js';
import { Chip, EmptyState, Notice } from '../../components/ui.jsx';
import { Check, useApiData } from './adminParts.jsx';
import styles from './admin.module.css';

const dayFmt = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' });
const formatDay = (value) => { const ms = toMs(value); return ms == null ? '—' : dayFmt.format(ms); };
const MOVE_LABELS = { alta: 'Alta', uso: 'Uso', devuelto: 'Devuelto', extension: 'Extensión' };

// Estado en texto: activo, agotado o vencido (con plata pero fuera de fecha).
function statusOf(c) {
  const exp = toMs(c.expiresAt);
  if (c.balance > 0 && exp != null && exp < Date.now()) return { label: 'Vencido', tone: 'removed' };
  if (c.status === 'agotado' || !(c.balance > 0)) return { label: 'Agotado', tone: 'neutral' };
  return { label: 'Activo', tone: 'done' };
}

function moveText(m) {
  const parts = [];
  if (m.amount != null) parts.push(formatMoney(m.amount));
  if (m.orderNumber) parts.push(m.orderNumber);
  if (m.type === 'extension') parts.push(m.expiresAt ? `hasta ${formatDay(m.expiresAt)}` : 'sin vencimiento');
  if (m.reason) parts.push(m.reason);
  return parts.join(' · ');
}

function ExtendForm({ credit, onDone }) {
  const [date, setDate] = useState('');
  const [never, setNever] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!never && !date) { setError('Elegí la nueva fecha de vencimiento (o marcá "Sin vencimiento")'); return; }
    if (!reason.trim()) { setError('El motivo es obligatorio'); return; }
    setSaving(true);
    setError('');
    try {
      // Hasta el final del día, hora de Argentina.
      const expiresAt = never ? null : new Date(`${date}T23:59:59-03:00`).toISOString();
      await api(`/admin/credits/${encodeURIComponent(credit.id)}/extend`, { method: 'POST', body: { expiresAt, reason: reason.trim() } });
      onDone('Vencimiento extendido.');
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form className={styles.destBox} onSubmit={submit}>
      <strong>Extender vencimiento</strong>
      <div className={styles.grid2}>
        <label className="field">
          <span className="field-label">Nueva fecha de vencimiento</span>
          <input className="input" type="date" value={date} disabled={never} onChange={(e) => setDate(e.target.value)} />
        </label>
        <Check label="Sin vencimiento" checked={never} onChange={setNever} />
      </div>
      <label className="field">
        <span className="field-label">Motivo *</span>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <Notice kind="error">{error}</Notice>
      <div><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Extender vencimiento'}</button></div>
    </form>
  );
}

function Detail({ credit, onExtended }) {
  const moves = credit.movements ?? [];
  return (
    <div className={styles.creditDetail}>
      <strong>Movimientos</strong>
      {moves.length === 0 && <p className={styles.muted}>Sin movimientos.</p>}
      {moves.length > 0 && (
        <ul className={styles.creditMoves}>
          {moves.map((m, i) => (
            <li key={i}>
              <span><strong>{MOVE_LABELS[m.type] ?? m.type}</strong> {moveText(m)}</span>
              <span className={styles.muted}>{m.by ?? '—'} · {formatDateTime(m.at)}</span>
            </li>
          ))}
        </ul>
      )}
      <ExtendForm credit={credit} onDone={onExtended} />
    </div>
  );
}

export default function CreditsView() {
  const locales = useApiData('/admin/locales');
  const [doc, setDoc] = useState('');
  const [query, setQuery] = useState({ doc: '', expired: false });
  const [credits, setCredits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [openId, setOpenId] = useState(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    setError('');
    try {
      const found = await api(`/admin/credits?doc=${encodeURIComponent(query.doc)}${query.expired ? '&expired=1' : ''}`);
      if (id === seq.current) setCredits(Array.isArray(found) ? found : (found.credits ?? []));
    } catch (err) {
      if (id === seq.current) { setCredits([]); setError(err.message); }
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [query]);
  useEffect(() => { load(); }, [load]);

  const localName = (id) => locales.data?.find((l) => l.id === id)?.name ?? id ?? '—';
  const search = (e) => { e.preventDefault(); setOpenId(null); setQuery({ doc: digitsOf(doc), expired: false }); };
  const showExpired = () => { setOpenId(null); setDoc(''); setQuery({ doc: '', expired: true }); };
  const showAll = () => { setOpenId(null); setDoc(''); setQuery({ doc: '', expired: false }); };

  return (
    <div className={styles.view}>
      <header className={styles.viewHead}>
        <h1 className={styles.viewTitle}>Saldos a favor</h1>
        <form className={styles.toolbar} onSubmit={search}>
          <input className={`input ${styles.searchInput}`} type="search" inputMode="numeric" placeholder="DNI o CUIT del cliente" aria-label="Buscar por DNI o CUIT" value={doc} onChange={(e) => setDoc(e.target.value)} />
          <button type="submit" className="btn btn-primary">Buscar</button>
          <button type="button" className="btn btn-secondary" onClick={showExpired} aria-pressed={query.expired}>Ver vencidos</button>
          {(query.doc || query.expired) && <button type="button" className="btn btn-ghost" onClick={showAll}>Ver todos</button>}
        </form>
      </header>

      <Notice kind="error">{error || locales.error}</Notice>
      <Notice kind="success" onClose={saved ? () => setSaved('') : undefined}>{saved}</Notice>
      {loading && <p className={styles.muted}>Cargando…</p>}
      {!loading && !error && credits.length === 0 && (
        <EmptyState title={query.expired ? 'No hay saldos vencidos' : query.doc ? 'Ese cliente no tiene saldos' : 'No hay saldos a favor'}>
          {query.doc || query.expired ? 'Probá con otro documento.' : 'Los saldos aparecen cuando una devolución se deja a favor del cliente.'}
        </EmptyState>
      )}

      {credits.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={`${styles.table} ${styles.clickable}`}>
            <thead>
              <tr><th>Cliente</th><th>Documento</th><th>Local y origen</th><th className={styles.right}>Monto</th><th className={styles.right}>Disponible</th><th>Vence</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {credits.flatMap((c) => {
                const st = statusOf(c);
                const open = openId === c.id;
                const toggle = () => setOpenId(open ? null : c.id);
                return [
                  <tr key={c.id} tabIndex={0} aria-expanded={open} onClick={toggle} onKeyDown={(e) => { if (e.key === 'Enter') toggle(); }}>
                    <td className={styles.wrapCell}>{c.customerName || '—'}</td>
                    <td className="num">{c.customerDoc}</td>
                    <td>{localName(c.localId)}{c.orderNumber ? <span className={styles.muted}> · {c.orderNumber}</span> : null}</td>
                    <td className={`${styles.right} num`}>{formatMoney(c.amount)}</td>
                    <td className={`${styles.right} num`}><strong>{formatMoney(c.balance)}</strong></td>
                    <td className="num">{c.expiresAt ? formatDay(c.expiresAt) : 'No vence'}</td>
                    <td><Chip tone={st.tone}>{st.label}</Chip></td>
                  </tr>,
                  open && (
                    <tr key={`${c.id}-detail`}>
                      <td colSpan={7}><Detail credit={c} onExtended={(msg) => { setSaved(msg); load(); }} /></td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
