import styles from './CustomerForm.module.css';

const FIELDS = [
  ['street', 'Calle', true], ['number', 'Número', false, 'numeric'], ['floor', 'Piso / depto'],
  ['city', 'Localidad'], ['zip', 'Código postal'], ['phone', 'Teléfono'],
];

export const EMPTY_SHIPPING = { street: '', number: '', floor: '', city: '', zip: '', phone: '', notes: '', amount: '' };

const SHIPPING_REQUIRED = { street: 'la calle', number: 'el número', city: 'la localidad', zip: 'el código postal', phone: 'el teléfono' };

// Formato argentino: punto de miles, coma decimal ("1.500,50"). Todo lo demás se rechaza.
export function shippingAmount(raw) {
  const text = String(raw ?? '').trim();
  if (!/^(d+|d{1,3}(.d{3})+)(,d+)?$/.test(text)) return { ok: false, value: NaN };
  const n = Number(text.replace(/./g, '').replace(',', '.'));
  return { ok: Number.isFinite(n) && n >= 0, value: n };
}

// Mismos mensajes que el backend (validateShipping).
export function shippingErrors(s) {
  const errors = Object.entries(SHIPPING_REQUIRED)
    .filter(([key]) => !String(s[key] ?? '').trim())
    .map(([, label]) => `Falta ${label} del envío`);
  if (!shippingAmount(s.amount).ok) errors.push('Costo de envío inválido');
  return errors;
}

// Datos del envío a domicilio (si alguna línea es "Envío a domicilio").
export default function ShippingFields({ value, onChange }) {
  const set = (key) => (e) => onChange({ [key]: e.target.value });
  return (
    <fieldset className={styles.form}>
      <legend className={styles.title}>Envío a domicilio</legend>
      <div className={styles.grid}>
        {FIELDS.map(([key, label, wide, mode]) => (
          <label key={key} className={`field ${wide ? styles.wide : ''}`}>
            <span className="field-label">{label}</span>
            <input className="input" inputMode={mode} value={value[key]} onChange={set(key)} autoComplete="off" />
          </label>
        ))}
        <label className={`field ${styles.wide}`}>
          <span className="field-label">Costo del envío ($, a mano)</span>
          <input className="input num" inputMode="decimal" placeholder="0" value={value.amount} onChange={set('amount')} />
        </label>
        <label className={`field ${styles.wide}`}>
          <span className="field-label">Notas</span>
          <textarea className={`input ${styles.notes}`} rows={2} value={value.notes} onChange={set('notes')} />
        </label>
      </div>
    </fieldset>
  );
}
