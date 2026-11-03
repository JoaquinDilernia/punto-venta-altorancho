import { useId } from 'react';
import { PRICE_LISTS, priceListHint } from '../lib/priceLists.js';
import styles from './PriceListPicker.module.css';

// Lista de precios del pedido (Normal / Decoradora / Directorio). Cambiarla
// recalcula los precios de todas las líneas en el servidor.
// `locked`: motivo por el que no se puede cambiar (p. ej. hay algo que vuelve).
export default function PriceListPicker({ value, settings, disabled = false, locked = '', onChange }) {
  const labelId = useId();
  const hint = locked || priceListHint(value, settings);
  return (
    <div className={styles.box}>
      <span className="field-label" id={labelId}>Lista de precios</span>
      <div className={styles.segmented} role="radiogroup" aria-labelledby={labelId}>
        {PRICE_LISTS.map((l) => (
          <button
            key={l.id}
            type="button"
            role="radio"
            aria-checked={value === l.id}
            className={value === l.id ? styles.on : ''}
            disabled={disabled || Boolean(locked) || value === l.id}
            onClick={() => onChange(l.id)}
          >
            {l.label}
          </button>
        ))}
      </div>
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  );
}
