import { useState } from 'react';
import { api } from '../../lib/api.js';
import { Chip, EmptyState, Notice } from '../../components/ui.jsx';
import { parseMoney } from '../caja/money.js';
import { Check, Drawer, numberText, slugify, useApiData } from './adminParts.jsx';
import styles from './admin.module.css';

const EMPTY = { id: null, label: '', discountPct: '0', odooName: '', hasDetails: false, details: [], order: '', active: true };

function toForm(m) {
  return {
    id: m.id, label: m.label ?? '', discountPct: numberText(m.discountPct ?? 0), odooName: m.odooName ?? '',
    hasDetails: (m.details ?? []).length > 0, details: (m.details ?? []).map((d) => ({ ...d })),
    order: String(m.order ?? ''), active: m.active !== false,
  };
}

export default function PaymentMethodsView() {
  const methods = useApiData('/admin/payment-methods');
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const list = methods.data ?? [];
  const set = (key) => (value) => setEditing((f) => ({ ...f, [key]: value }));
  const setDetail = (i, key, value) => setEditing((f) => ({ ...f, details: f.details.map((d, j) => (j === i ? { ...d, [key]: value } : d)) }));

  function openEdit(m) { setError(''); setSaved(''); setEditing(toForm(m)); }
  function openNew() {
    setError('');
    setSaved('');
    setEditing({ ...EMPTY, order: String((list.reduce((max, m) => Math.max(max, m.order ?? 0), 0)) + 1) });
  }

  async function save() {
    const f = editing;
    const pct = parseMoney(f.discountPct);
    if (!f.label.trim()) { setError('Falta el nombre'); return; }
    if (!pct.ok || pct.value > 100) { setError('El descuento tiene que ser un número entre 0 y 100'); return; }
    const order = Number(f.order);
    if (!Number.isInteger(order) || order < 0) { setError('El orden tiene que ser un número entero'); return; }
    const id = f.id ?? slugify(f.label);
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) { setError('Con ese nombre no se puede armar un código: usá letras o números'); return; }
    if (!f.id && list.some((m) => m.id === id)) { setError(`Ya existe un medio de pago con el código "${id}"`); return; }

    // Los detalles nuevos toman el código de su nombre; los que ya existían lo conservan.
    const used = new Set(f.details.map((d) => d.id).filter(Boolean));
    const details = f.hasDetails ? f.details.map((d, i) => {
      let detailId = d.id;
      if (!detailId) {
        detailId = slugify(d.label) || `opcion-${i + 1}`;
        while (used.has(detailId)) detailId = `${detailId}-${i + 1}`;
        used.add(detailId);
      }
      return { id: detailId, label: d.label.trim(), odooName: d.odooName.trim() };
    }) : [];
    if (f.hasDetails && details.length === 0) { setError('Agregá al menos una opción, o desmarcá "Tiene opciones"'); return; }

    setSaving(true);
    setError('');
    try {
      await api(`/admin/payment-methods/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: { label: f.label.trim(), discountPct: pct.value, odooName: f.hasDetails ? null : f.odooName.trim(), details, order, active: f.active },
      });
      setSaved(`${f.label.trim()} guardado.`);
      setEditing(null);
      methods.reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.view}>
      <header className={styles.viewHead}>
        <h1 className={styles.viewTitle}>Medios de pago</h1>
        <button type="button" className="btn btn-primary" onClick={openNew}>Nuevo medio</button>
      </header>
      <Notice kind="error">{methods.error}</Notice>
      <Notice kind="success" onClose={saved ? () => setSaved('') : undefined}>{saved}</Notice>
      {methods.loading && !methods.data && <p className={styles.muted}>Cargando…</p>}
      {methods.data && list.length === 0 && <EmptyState title="No hay medios de pago" />}
      {list.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={`${styles.table} ${styles.clickable}`}>
            <thead><tr><th>Orden</th><th>Nombre</th><th className={styles.right}>Descuento</th><th>Medio de Odoo</th><th>Estado</th></tr></thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id} tabIndex={0} onClick={() => openEdit(m)} onKeyDown={(e) => { if (e.key === 'Enter') openEdit(m); }} className={m.active === false ? styles.rowOff : ''}>
                  <td className="num">{m.order}</td>
                  <td><strong>{m.label}</strong></td>
                  <td className={`${styles.right} num`}>{m.discountPct} %</td>
                  <td>{m.details?.length ? m.details.map((d) => `${d.label}: ${d.odooName}`).join(' · ') : m.odooName}</td>
                  <td><Chip tone={m.active === false ? 'neutral' : 'done'}>{m.active === false ? 'Inactivo' : 'Activo'}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Drawer title={editing.id ? `Editar ${editing.label}` : 'Nuevo medio de pago'} onClose={() => setEditing(null)} onSubmit={save} saving={saving}>
          <Notice kind="error">{error}</Notice>
          <label className="field">
            <span className="field-label">Nombre *</span>
            <input className="input" value={editing.label} onChange={(e) => set('label')(e.target.value)} />
          </label>
          <div className={styles.grid2}>
            <label className="field">
              <span className="field-label">Descuento (%)</span>
              <input className="input num" inputMode="decimal" value={editing.discountPct} onChange={(e) => set('discountPct')(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Orden</span>
              <input className="input num" inputMode="numeric" value={editing.order} onChange={(e) => set('order')(e.target.value)} />
            </label>
          </div>
          <Check label="Tiene opciones (por ejemplo, cuotas)" checked={editing.hasDetails} onChange={set('hasDetails')} />
          {!editing.hasDetails ? (
            <label className="field">
              <span className="field-label">Medio de pago en Odoo (nombre exacto) *</span>
              <input className="input" value={editing.odooName} onChange={(e) => set('odooName')(e.target.value)} />
            </label>
          ) : (
            <div className={styles.detailRows}>
              {editing.details.map((d, i) => (
                <div key={d.id ?? `new-${i}`} className={styles.detailRow}>
                  <label className="field">
                    <span className="field-label">Opción</span>
                    <input className="input input-sm" value={d.label} placeholder="Ej. 3 cuotas" onChange={(e) => setDetail(i, 'label', e.target.value)} />
                  </label>
                  <label className="field">
                    <span className="field-label">Medio en Odoo</span>
                    <input className="input input-sm" value={d.odooName} placeholder="Ej. Mercado Pago 3 cuotas" onChange={(e) => setDetail(i, 'odooName', e.target.value)} />
                  </label>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing((f) => ({ ...f, details: f.details.filter((_, j) => j !== i) }))}>Quitar</button>
                </div>
              ))}
              <div><button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing((f) => ({ ...f, details: [...f.details, { id: null, label: '', odooName: '' }] }))}>Agregar opción</button></div>
            </div>
          )}
          <Check label="Medio activo" checked={editing.active} onChange={set('active')} />
        </Drawer>
      )}
    </div>
  );
}
