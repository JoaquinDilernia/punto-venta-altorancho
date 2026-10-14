import { useState } from 'react';
import { api } from '../../lib/api.js';
import { Chip, EmptyState, Notice } from '../../components/ui.jsx';
import { Check, Drawer, OdooSelect, useApiData } from './adminParts.jsx';
import styles from './admin.module.css';

const byId = (list, id) => list?.find((o) => o.id === id);

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
    });
  }
  const set = (key) => (value) => setEditing((f) => ({ ...f, [key]: value }));

  async function save() {
    const { id, name, address, warehouseId, stockLocationId, exhibicionLocationId, teamId, invoiceJournalId, active } = editing;
    setSaving(true);
    setError('');
    try {
      await api(`/admin/locales/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: { name: name.trim(), address: address.trim(), warehouseId, stockLocationId, exhibicionLocationId, teamId, invoiceJournalId, active },
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
          <Check label="Local activo" checked={editing.active} onChange={set('active')} />
        </Drawer>
      )}
    </div>
  );
}
