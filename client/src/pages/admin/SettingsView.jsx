import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { Notice } from '../../components/ui.jsx';
import { OdooSelect, useApiData } from './adminParts.jsx';
import styles from './admin.module.css';

const pickingName = (o) => (Array.isArray(o.warehouse_id) ? `${o.warehouse_id[1]} · ${o.name}` : o.name);

function toForm(s) {
  return {
    rolonWarehouseId: s.rolon?.warehouseId ?? null,
    rolonLocationId: s.rolon?.locationId ?? null,
    rolonPickingTypeId: s.rolon?.outPickingTypeId ?? null,
    webLocationId: s.web?.locationId ?? null,
    fullPricelistId: s.fullPricelistId ?? null,
    promoPricelistId: s.promoPricelistId ?? null,
    shippingProductSku: s.shippingProductSku ?? '',
    decoradorTagId: s.decoradorTagId ?? null,
  };
}

export default function SettingsView() {
  const settings = useApiData('/admin/settings');
  const options = useApiData('/admin/options');
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => { if (settings.data) setForm(toForm(settings.data)); }, [settings.data]);
  const set = (key) => (value) => { setSaved(''); setForm((f) => ({ ...f, [key]: value })); };
  const opts = options.data;

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSaved('');
    try {
      // Se manda el documento entero: el backend lo reemplaza.
      const result = await api('/admin/settings', {
        method: 'PUT',
        body: {
          rolon: { warehouseId: form.rolonWarehouseId, locationId: form.rolonLocationId, outPickingTypeId: form.rolonPickingTypeId },
          web: { locationId: form.webLocationId },
          fullPricelistId: form.fullPricelistId,
          promoPricelistId: form.promoPricelistId,
          shippingProductSku: form.shippingProductSku.trim(),
          decoradorTagId: form.decoradorTagId,
        },
      });
      setForm(toForm(result));
      setSaved('Ajustes guardados.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.view}>
      <header className={styles.viewHead}><h1 className={styles.viewTitle}>Ajustes</h1></header>
      <Notice kind="error">{settings.error || options.error}</Notice>
      {(!form || !opts) && !settings.error && !options.error && <p className={styles.muted}>Cargando…</p>}
      {form && opts && (
        <form className={`${styles.card} ${styles.formCard}`} onSubmit={save}>
          <h2 className={styles.cardTitle}>Rolón</h2>
          <div className={styles.grid2}>
            <OdooSelect label="Depósito de Rolón" required options={opts.warehouses} value={form.rolonWarehouseId} onChange={set('rolonWarehouseId')} />
            <OdooSelect label="Ubicación de Rolón" required options={opts.locations} nameOf={(o) => o.complete_name} value={form.rolonLocationId} onChange={set('rolonLocationId')} />
            <div className={styles.span2}>
              <OdooSelect label="Tipo de operación de despachos (informativo)" options={opts.pickingTypes} nameOf={pickingName} value={form.rolonPickingTypeId} onChange={set('rolonPickingTypeId')} empty="Sin definir" />
              <p className={styles.hint}>Informativo: el sistema crea un pedido de Odoo por depósito y ya no arma los despachos.</p>
            </div>
          </div>

          <h2 className={styles.cardTitle}>Web</h2>
          <OdooSelect label="Ubicación del stock web" required options={opts.locations} nameOf={(o) => o.complete_name} value={form.webLocationId} onChange={set('webLocationId')} />

          <h2 className={styles.cardTitle}>Precios</h2>
          <OdooSelect label="Lista de precios full" options={opts.pricelists} value={form.fullPricelistId} onChange={set('fullPricelistId')} empty="Usar el precio de venta del producto" />
          <OdooSelect label="Lista de precios promocional" options={opts.pricelists} value={form.promoPricelistId} onChange={set('promoPricelistId')} empty="Sin lista promocional" />
          <p className={styles.hint}>Las listas cambian de nombre cada mes en Odoo: actualizalas acá cuando cambien.</p>

          <h2 className={styles.cardTitle}>Otros</h2>
          <div className={styles.grid2}>
            <label className="field">
              <span className="field-label">SKU del producto de envío *</span>
              <input className="input" value={form.shippingProductSku} onChange={(e) => set('shippingProductSku')(e.target.value)} />
            </label>
            <OdooSelect label="Etiqueta de decorador" options={opts.tags} value={form.decoradorTagId} onChange={set('decoradorTagId')} empty="Sin etiqueta" />
          </div>

          <div><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar ajustes'}</button></div>
          <Notice kind="error">{error}</Notice>
          <Notice kind="success" onClose={saved ? () => setSaved('') : undefined}>{saved}</Notice>
        </form>
      )}
    </div>
  );
}
