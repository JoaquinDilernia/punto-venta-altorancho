import { useState } from 'react';
import { api } from '../../lib/api.js';
import { formatMoney } from '../../lib/labels.js';
import { Chip, EmptyState, Notice } from '../../components/ui.jsx';
import { parseMoney } from '../caja/money.js';
import { Check, Drawer, numberText, useApiData } from './adminParts.jsx';
import styles from './admin.module.css';

const KIND_LABELS = { cupon: 'Cupón', motivo: 'Motivo para caja', auto: 'Automática' };
const EMPTY = {
  id: null, name: '', kind: 'cupon', type: 'pct', value: '', code: '', from: '', to: '',
  requiresPaymentMethodId: '', requiresCustomerTagId: null, active: true,
};

const valueText = (p) => (p.type === 'pct' ? `${p.value} %` : formatMoney(p.value));

// Hoy en Argentina como AAAA-MM-DD, para marcar las promociones vencidas.
const today = () => new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

function validity(p) {
  if (!p.from && !p.to) return 'Siempre';
  return `${p.from ? `desde ${p.from}` : ''}${p.from && p.to ? ' ' : ''}${p.to ? `hasta ${p.to}` : ''}`;
}

export default function PromotionsView() {
  const promos = useApiData('/admin/promotions');
  const methods = useApiData('/admin/payment-methods');
  const options = useApiData('/admin/options');
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const methodName = (id) => methods.data?.find((m) => m.id === id)?.label ?? id;
  const tagName = (id) => options.data?.tags?.find((t) => t.id === id)?.name ?? (options.data ? 'Etiqueta que ya no existe' : '…');
  const set = (key) => (value) => setEditing((f) => ({ ...f, [key]: value }));

  function openEdit(p) {
    setError('');
    setSaved('');
    setEditing({
      id: p.id, name: p.name ?? '', kind: p.kind, type: p.type, value: numberText(p.value), code: p.code ?? '',
      from: p.from ?? '', to: p.to ?? '', requiresPaymentMethodId: p.requiresPaymentMethodId ?? '',
      requiresCustomerTagId: p.requiresCustomerTagId ?? null, active: p.active !== false,
    });
  }
  function openNew() { setError(''); setSaved(''); setEditing({ ...EMPTY }); }

  async function save() {
    const f = editing;
    const value = parseMoney(f.value);
    if (!f.name.trim()) { setError('Falta el nombre'); return; }
    if (!value.ok || value.value <= 0) { setError(f.type === 'pct' ? 'Escribí el porcentaje de descuento' : 'Escribí el monto del descuento'); return; }
    if (f.type === 'pct' && value.value > 100) { setError('El porcentaje tiene que estar entre 1 y 100'); return; }
    if (f.kind === 'cupon' && !f.code.trim()) { setError('El cupón necesita un código'); return; }
    if (f.from && f.to && f.from > f.to) { setError('La fecha "desde" es posterior a "hasta"'); return; }
    const body = {
      name: f.name.trim(), kind: f.kind, type: f.type, value: value.value,
      code: f.kind === 'cupon' ? f.code.trim().toUpperCase() : null,
      from: f.from || null, to: f.to || null,
      requiresPaymentMethodId: f.requiresPaymentMethodId || null,
      requiresCustomerTagId: f.requiresCustomerTagId,
      active: f.active,
    };
    setSaving(true);
    setError('');
    try {
      if (f.id) await api(`/admin/promotions/${encodeURIComponent(f.id)}`, { method: 'PUT', body });
      else await api('/admin/promotions', { method: 'POST', body });
      setSaved(`${body.name} guardada.`);
      setEditing(null);
      promos.reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const list = promos.data ?? [];

  return (
    <div className={styles.view}>
      <header className={styles.viewHead}>
        <h1 className={styles.viewTitle}>Promociones</h1>
        <button type="button" className="btn btn-primary" onClick={openNew}>Nueva promoción</button>
      </header>
      <p className={styles.hint}>Se aplica sobre el subtotal (después del descuento por medio de pago). Una sola por venta. Las promociones no se borran: se desactivan.</p>
      <Notice kind="error">{promos.error || methods.error || options.error}</Notice>
      <Notice kind="success" onClose={saved ? () => setSaved('') : undefined}>{saved}</Notice>
      {promos.loading && !promos.data && <p className={styles.muted}>Cargando…</p>}
      {promos.data && list.length === 0 && <EmptyState title="Todavía no hay promociones">Creá la primera con &quot;Nueva promoción&quot;.</EmptyState>}
      {list.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={`${styles.table} ${styles.clickable}`}>
            <thead><tr><th>Nombre</th><th>Tipo</th><th className={styles.right}>Descuento</th><th>Código</th><th>Vigencia</th><th>Condiciones</th><th>Estado</th></tr></thead>
            <tbody>
              {list.map((p) => {
                const expired = p.to && p.to < today();
                const conditions = [
                  p.requiresPaymentMethodId ? `Solo ${methodName(p.requiresPaymentMethodId)}` : null,
                  p.requiresCustomerTagId ? `Cliente: ${tagName(p.requiresCustomerTagId)}` : null,
                ].filter(Boolean).join(' · ');
                return (
                  <tr key={p.id} tabIndex={0} onClick={() => openEdit(p)} onKeyDown={(e) => { if (e.key === 'Enter') openEdit(p); }} className={p.active === false ? styles.rowOff : ''}>
                    <td><strong>{p.name}</strong></td>
                    <td>{KIND_LABELS[p.kind] ?? p.kind}</td>
                    <td className={`${styles.right} num`}>{valueText(p)}</td>
                    <td className="num">{p.code || '—'}</td>
                    <td>{validity(p)}</td>
                    <td>{conditions || '—'}</td>
                    <td>
                      {p.active === false ? <Chip tone="neutral">Inactiva</Chip>
                        : expired ? <Chip tone="pending">Vencida</Chip> : <Chip tone="done">Activa</Chip>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Drawer title={editing.id ? `Editar ${editing.name}` : 'Nueva promoción'} onClose={() => setEditing(null)} onSubmit={save} saving={saving}>
          <Notice kind="error">{error}</Notice>
          <label className="field">
            <span className="field-label">Nombre *</span>
            <input className="input" value={editing.name} onChange={(e) => set('name')(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Tipo</span>
            <select className="select" value={editing.kind} onChange={(e) => set('kind')(e.target.value)}>
              {Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          {editing.kind === 'cupon' && (
            <label className="field">
              <span className="field-label">Código del cupón *</span>
              <input className="input" value={editing.code} onChange={(e) => set('code')(e.target.value.toUpperCase())} autoComplete="off" />
            </label>
          )}
          <div className={styles.grid2}>
            <label className="field">
              <span className="field-label">Descuento en</span>
              <select className="select" value={editing.type} onChange={(e) => set('type')(e.target.value)}>
                <option value="pct">Porcentaje (%)</option>
                <option value="amount">Monto fijo ($)</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">{editing.type === 'pct' ? 'Porcentaje (1 a 100) *' : 'Monto en pesos *'}</span>
              <input className="input num" inputMode="decimal" value={editing.value} onChange={(e) => set('value')(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Vigente desde</span>
              <input className="input" type="date" value={editing.from} onChange={(e) => set('from')(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Vigente hasta (inclusive)</span>
              <input className="input" type="date" value={editing.to} onChange={(e) => set('to')(e.target.value)} />
            </label>
          </div>
          <label className="field">
            <span className="field-label">Solo con el medio de pago</span>
            <select className="select" value={editing.requiresPaymentMethodId} onChange={(e) => set('requiresPaymentMethodId')(e.target.value)}>
              <option value="">Cualquiera</option>
              {(methods.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Solo clientes con la etiqueta</span>
            <select className="select" value={editing.requiresCustomerTagId ?? ''} onChange={(e) => set('requiresCustomerTagId')(e.target.value === '' ? null : Number(e.target.value))}>
              <option value="">Cualquier cliente</option>
              {[...(options.data?.tags ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'es')).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              {editing.requiresCustomerTagId != null && !options.data?.tags?.some((t) => t.id === editing.requiresCustomerTagId) && (
                <option value={editing.requiresCustomerTagId}>Etiqueta que ya no existe</option>
              )}
            </select>
          </label>
          <Check label="Promoción activa" checked={editing.active} onChange={set('active')} />
        </Drawer>
      )}
    </div>
  );
}
