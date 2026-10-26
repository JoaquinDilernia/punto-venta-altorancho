import { useState } from 'react';
import { api } from '../../lib/api.js';
import { Chip, EmptyState, Notice } from '../../components/ui.jsx';
import { Check, Drawer, OdooSelect, slugify, useApiData } from './adminParts.jsx';
import styles from './admin.module.css';

const byId = (list, id) => list?.find((o) => o.id === id);
const ROLON_STOCK_ID = 174;
const numOrNull = (v) => { const n = Number(String(v).trim()); return String(v).trim() === '' || !Number.isInteger(n) || n <= 0 ? null : n; };

// Id de un destino nuevo: sale del nombre y no se repite.
function destinationId(label, taken) {
  const base = slugify(label).slice(0, 30).replace(/-+$/, '') || 'destino';
  let id = base;
  for (let i = 2; taken.has(id); i += 1) id = `${base.slice(0, 30 - String(i).length - 1)}-${i}`;
  return id;
}

// Los de siempre, con el stock y la exhibición del local.
function usualDestinations(f) {
  return [
    { id: 'stock', label: 'Stock', locationId: f.stockLocationId, transferToLocationId: null, default: true, active: true },
    { id: 'exhibicion', label: 'Exhibición', locationId: f.exhibicionLocationId, transferToLocationId: null, default: false, active: true },
    { id: 'rolon', label: 'Enviar a Rolón', locationId: f.stockLocationId, transferToLocationId: ROLON_STOCK_ID, default: false, active: true },
  ];
}

export default function LocalesView() {
  const locales = useApiData('/admin/locales');
  const options = useApiData('/admin/options');
  const [editing, setEditing] = useState(null); // { id, ...form }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const opts = options.data;
  const loc = (id) => byId(opts?.locations, id)?.complete_name ?? (id ? 'Ya no existe en Odoo' : '—');

  function edit(l) {
    setError('');
    setSaved('');
    setEditing({
      id: l.id, name: l.name ?? '', address: l.address ?? '', warehouseId: l.warehouseId ?? null,
      stockLocationId: l.stockLocationId ?? null, exhibicionLocationId: l.exhibicionLocationId ?? null,
      teamId: l.teamId ?? null, invoiceJournalId: l.invoiceJournalId ?? null, active: l.active !== false,
      returnDestinations: (l.returnDestinations ?? []).map((d) => ({ ...d, transferToLocationId: d.transferToLocationId ?? null })),
      returnPickingTypeId: l.returnPickingTypeId == null ? '' : String(l.returnPickingTypeId),
      internalPickingTypeId: l.internalPickingTypeId == null ? '' : String(l.internalPickingTypeId),
    });
  }
  const set = (key) => (value) => setEditing((f) => ({ ...f, [key]: value }));

  const setDest = (index, patch) => setEditing((f) => ({ ...f, returnDestinations: f.returnDestinations.map((d, i) => (i === index ? { ...d, ...patch } : d)) }));
  const makeDefault = (index) => setEditing((f) => ({ ...f, returnDestinations: f.returnDestinations.map((d, i) => ({ ...d, default: i === index })) }));
  const addDest = () => setEditing((f) => ({
    ...f, returnDestinations: [...f.returnDestinations, { id: '', label: '', locationId: null, transferToLocationId: null, default: f.returnDestinations.length === 0, active: true }],
  }));
  const removeDest = (index) => setEditing((f) => ({ ...f, returnDestinations: f.returnDestinations.filter((_, i) => i !== index) }));
  const loadUsual = () => setEditing((f) => ({ ...f, returnDestinations: usualDestinations(f) }));

  async function save() {
    const { id, name, address, warehouseId, stockLocationId, exhibicionLocationId, teamId, invoiceJournalId, active } = editing;
    // Se manda el local entero: el backend lo reemplaza.
    const taken = new Set(editing.returnDestinations.map((d) => d.id).filter(Boolean));
    const returnDestinations = editing.returnDestinations.map((d) => {
      const dest = { ...d, label: d.label.trim() };
      if (!dest.id) { dest.id = destinationId(dest.label, taken); taken.add(dest.id); }
      return dest;
    });
    setSaving(true);
    setError('');
    try {
      await api(`/admin/locales/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: { name: name.trim(), address: address.trim(), warehouseId, stockLocationId, exhibicionLocationId, teamId, invoiceJournalId, active,
          returnDestinations, returnPickingTypeId: numOrNull(editing.returnPickingTypeId), internalPickingTypeId: numOrNull(editing.internalPickingTypeId),
        },
      });
      setSaved(`Local ${name.trim()} guardado.`);
      setEditing(null);
      locales.reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.view}>
      <header className={styles.viewHead}><h1 className={styles.viewTitle}>Locales</h1></header>
      <Notice kind="error">{locales.error || options.error}</Notice>
      <Notice kind="success" onClose={saved ? () => setSaved('') : undefined}>{saved}</Notice>
      {locales.loading && !locales.data && <p className={styles.muted}>Cargando…</p>}
      {locales.data?.length === 0 && <EmptyState title="No hay locales cargados" />}
      {locales.data?.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={`${styles.table} ${styles.clickable}`}>
            <thead><tr><th>Código</th><th>Nombre</th><th>Depósito</th><th>Stock</th><th>Exhibición</th><th>Facturación</th><th>Estado</th></tr></thead>
            <tbody>
              {locales.data.map((l) => (
                <tr key={l.id} tabIndex={0} onClick={() => edit(l)} onKeyDown={(e) => { if (e.key === 'Enter') edit(l); }} className={l.active === false ? styles.rowOff : ''}>
                  <td className="num"><strong>{l.id}</strong></td>
                  <td>{l.name}</td>
                  <td>{opts ? (byId(opts.warehouses, l.warehouseId)?.name ?? '—') : '…'}</td>
                  <td>{opts ? loc(l.stockLocationId) : '…'}</td>
                  <td>{opts ? loc(l.exhibicionLocationId) : '…'}</td>
                  <td>{l.invoiceJournalId ? (opts ? (byId(opts.journals, l.invoiceJournalId)?.name ?? '—') : '…') : 'Sin facturación'}</td>
                  <td><Chip tone={l.active === false ? 'neutral' : 'done'}>{l.active === false ? 'Inactivo' : 'Activo'}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Drawer title={`Editar local ${editing.id}`} onClose={() => setEditing(null)} onSubmit={save} saving={saving || !opts}>
          <Notice kind="error">{error}</Notice>
          {!opts && <p className={styles.muted}>Cargando opciones de Odoo…</p>}
          <label className="field">
            <span className="field-label">Nombre *</span>
            <input className="input" value={editing.name} onChange={(e) => set('name')(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Dirección (aparece en &quot;Retira en {editing.name || 'Local'}&quot;)</span>
            <input className="input" value={editing.address} onChange={(e) => set('address')(e.target.value)} />
          </label>
          {opts && (
            <>
              <OdooSelect label="Depósito" required options={opts.warehouses} value={editing.warehouseId} onChange={set('warehouseId')} />
              <OdooSelect label="Ubicación de stock" required options={opts.locations} nameOf={(o) => o.complete_name} value={editing.stockLocationId} onChange={set('stockLocationId')} />
              <OdooSelect label="Ubicación de exhibición" required options={opts.locations} nameOf={(o) => o.complete_name} value={editing.exhibicionLocationId} onChange={set('exhibicionLocationId')} />
              <OdooSelect label="Equipo de ventas" required options={opts.teams} value={editing.teamId} onChange={set('teamId')} />
              <OdooSelect label="Diario de facturas" options={opts.journals} value={editing.invoiceJournalId} onChange={set('invoiceJournalId')} empty="Sin facturación" />
            </>
          )}
          <h3 className={styles.cardTitle}>Destinos de devolución</h3>
          <p className={styles.hint}>Adónde puede ir la mercadería que vuelve. Tiene que haber uno solo marcado como &quot;Por defecto&quot; entre los activos.</p>
          {opts && editing.returnDestinations.length === 0 && <p className={styles.muted}>Este local todavía no tiene destinos.</p>}
          {opts && editing.returnDestinations.map((d, i) => (
            <fieldset key={d.id || `nuevo-${i}`} className={styles.destBox}>
              <label className="field">
                <span className="field-label">Nombre *</span>
                <input className="input" value={d.label} onChange={(e) => setDest(i, { label: e.target.value })} />
              </label>
              <OdooSelect label="Ubicación de Odoo" required options={opts.locations} nameOf={(o) => o.complete_name} value={d.locationId} onChange={(v) => setDest(i, { locationId: v })} />
              <OdooSelect label="Mandar después a" options={opts.locations} nameOf={(o) => o.complete_name} value={d.transferToLocationId} onChange={(v) => setDest(i, { transferToLocationId: v })} empty="No mandar a otro lado" />
              <div className={styles.destFlags}>
                <label className={styles.check}><input type="radio" name="returnDefault" checked={d.default} onChange={() => makeDefault(i)} /><span>Por defecto</span></label>
                <Check label="Activo" checked={d.active} onChange={(v) => setDest(i, { active: v })} />
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeDest(i)}>Quitar</button>
              </div>
            </fieldset>
          ))}
          <div className={styles.toolbar}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={addDest}>Agregar destino</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={loadUsual}>Cargar los de siempre</button>
          </div>
          <p className={styles.hint}>&quot;Cargar los de siempre&quot; reemplaza la lista por Stock, Exhibición y Enviar a Rolón.</p>
          <label className="field">
            <span className="field-label">Tipo de remito de devolución (id de Odoo)</span>
            <input className="input num" inputMode="numeric" value={editing.returnPickingTypeId} onChange={(e) => set('returnPickingTypeId')(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Tipo de transferencia interna (id de Odoo)</span>
            <input className="input num" inputMode="numeric" value={editing.internalPickingTypeId} onChange={(e) => set('internalPickingTypeId')(e.target.value)} />
          </label>
          <Check label="Local activo" checked={editing.active} onChange={set('active')} />
        </Drawer>
      )}
    </div>
  );
}
