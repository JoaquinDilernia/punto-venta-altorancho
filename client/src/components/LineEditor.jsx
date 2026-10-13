import { DELIVERY_LABELS, ORIGIN_LABELS } from '../lib/labels.js';
import styles from './LineEditor.module.css';

const ORIGINS = ['stock', 'exhibicion', 'rolon'];
const DELIVERIES = ['ahora', 'retira_local', 'envio', 'retira_rolon', 'retira_otro_local'];

export const deliveryAllowed = (delivery, origin) => {
  if (delivery === 'ahora') return origin !== 'rolon';
  if (delivery === 'retira_rolon' || delivery === 'retira_otro_local') return origin === 'rolon';
  return true;
};

// Disponible por origen según el stock del producto (null = no se conoce).
export function availableFor(stock, origin) {
  if (!stock) return null;
  if (origin === 'stock') return stock.local?.stock ?? 0;
  if (origin === 'exhibicion') return stock.local?.exhibicion ?? 0;
  return stock.rolon ?? 0;
}

// Valores iniciales al agregar un producto: del local si hay, si no Rolón.
export function defaultLineValue(stock) {
  const origin = ORIGINS.find((o) => (availableFor(stock, o) ?? 0) > 0) ?? 'stock';
  return { qty: 1, origin, delivery: origin === 'rolon' ? 'retira_local' : 'ahora', pickupLocalId: null };
}

// Formulario de cantidad / origen / entrega / local de retiro. Sirve para
// agregar (con `stock` del producto) y para editar una línea del carrito
// (sin `stock`: el servidor valida la disponibilidad).
export default function LineEditor({ stock, locales, ownLocalId, value, onChange }) {
  const set = (changes) => onChange({ ...value, ...changes });

  function setOrigin(origin) {
    const delivery = deliveryAllowed(value.delivery, origin) ? value.delivery : 'retira_local';
    set({ origin, delivery, pickupLocalId: delivery === 'retira_otro_local' ? value.pickupLocalId : null });
  }
  function setDelivery(delivery) {
    set({ delivery, pickupLocalId: delivery === 'retira_otro_local' ? value.pickupLocalId : null });
  }
  const setQty = (n) => set({ qty: Math.max(1, Math.floor(Number(n)) || 1) });
  const others = locales.filter((l) => l.id !== ownLocalId);

  return (
    <div className={styles.editor}>
      <div className={styles.group}>
        <span className="field-label">Cantidad</span>
        <div className={styles.stepper}>
          <button type="button" className="btn btn-secondary" aria-label="Menos" onClick={() => setQty(value.qty - 1)} disabled={value.qty <= 1}>−</button>
          <input className="input num" type="number" inputMode="numeric" min="1" aria-label="Cantidad" value={value.qty} onChange={(e) => setQty(e.target.value)} />
          <button type="button" className="btn btn-secondary" aria-label="Más" onClick={() => setQty(value.qty + 1)}>+</button>
        </div>
      </div>

      <fieldset className={styles.group}>
        <legend className="field-label">Sale de</legend>
        <div className={styles.options}>
          {ORIGINS.map((o) => {
            const avail = availableFor(stock, o);
            const disabled = avail === 0;
            return (
              <label key={o} className={`${styles.option} ${value.origin === o ? styles.optionOn : ''} ${disabled ? styles.optionOff : ''}`}>
                <input type="radio" name="origin" checked={value.origin === o} disabled={disabled} onChange={() => setOrigin(o)} />
                <span>{ORIGIN_LABELS[o]}</span>
                {avail != null && <span className={`${styles.avail} num`}>{avail}</span>}
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend className="field-label">Entrega</legend>
        <div className={styles.options}>
          {DELIVERIES.map((d) => {
            const disabled = !deliveryAllowed(d, value.origin);
            return (
              <label key={d} className={`${styles.option} ${value.delivery === d ? styles.optionOn : ''} ${disabled ? styles.optionOff : ''}`}>
                <input type="radio" name="delivery" checked={value.delivery === d} disabled={disabled} onChange={() => setDelivery(d)} />
                <span>{DELIVERY_LABELS[d]}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {value.delivery === 'retira_otro_local' && (
        <label className="field">
          <span className="field-label">Local donde retira</span>
          <select className="select" value={value.pickupLocalId ?? ''} onChange={(e) => set({ pickupLocalId: e.target.value || null })}>
            <option value="">Elegí un local…</option>
            {others.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}
