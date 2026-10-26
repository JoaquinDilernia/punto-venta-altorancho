import { useEffect, useState } from 'react';
import { formatMoney } from '../lib/labels.js';
import { SOURCE_LABELS, maxReturnable } from '../lib/returns.js';
import styles from './ReturnPicker.module.css';

const OTHER = 'Otro';

// Detalle del motivo: se edita local y se guarda al salir del campo (no un
// PATCH por tecla). Con "Otro" no puede quedar vacío.
function ReasonNote({ rl, busy, onEdit }) {
  const [note, setNote] = useState(rl.reasonNote ?? '');
  useEffect(() => { setNote(rl.reasonNote ?? ''); }, [rl.reasonNote]);
  const missing = rl.reason === OTHER && !note.trim();
  function commit() {
    if (missing || note.trim() === (rl.reasonNote ?? '')) return;
    onEdit(rl, { reasonNote: note.trim() });
  }
  return (
    <>
      <input
        className="input"
        aria-label="Detalle del motivo"
        aria-invalid={missing || undefined}
        placeholder={rl.reason === OTHER ? 'Contanos el motivo (obligatorio)' : 'Detalle del motivo'}
        disabled={busy}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
      />
      {missing && <p className={styles.fieldError} role="alert">Con "Otro" escribí el motivo</p>}
    </>
  );
}

// Lo que vuelve: `lines` son las líneas de devolución de la operación.
// `onEdit(rl, { qty | destinationId | reasonNote })`, `onRemove(rl)`.
// Con `readOnly` solo se muestra (cantidad, destino y motivo).
export default function ReturnLines({ lines, destinations = [], busy, readOnly = false, onEdit, onRemove }) {
  const destLabel = (id) => destinations.find((d) => d.id === id)?.label ?? id ?? '—';
  return (
    <ul className={styles.linesList}>
      {(lines ?? []).map((rl, i) => {
        const cap = rl.source === 'manual' || rl.qtyBought == null ? Infinity : maxReturnable(rl);
        return (
          <li key={rl.rlId ?? `${rl.purchaseLineId}-${i}`} className={styles.rl}>
            <div className={styles.rlTop}>
              <div className={styles.lineMain}>
                <p className={styles.name}>{rl.name}</p>
                <p className={styles.gray}>
                  {rl.sku} · {SOURCE_LABELS[rl.source] ?? rl.source}{rl.purchaseLabel || rl.purchaseId ? ` ${rl.purchaseLabel ?? rl.purchaseId}` : ''}
                </p>
              </div>
              <p className={`${styles.negative} num`}>− {formatMoney(rl.qty * rl.unitValue)}</p>
            </div>
            {readOnly ? (
              <p className={styles.meta}>
                <span className="num">{rl.qty} × {formatMoney(rl.unitValue)}</span> · Destino: {destLabel(rl.destinationId)} · Motivo: {rl.reason}{rl.reasonNote ? ` (${rl.reasonNote})` : ''}
              </p>
            ) : (
              <>
                <div className={styles.rlControls}>
                  <div className={styles.qty}>
                    <button type="button" className="btn btn-secondary" aria-label="Menos" disabled={busy || rl.qty <= 1} onClick={() => onEdit(rl, { qty: rl.qty - 1 })}>−</button>
                    <span className="num">{rl.qty}</span>
                    <button type="button" className="btn btn-secondary" aria-label="Más" disabled={busy || rl.qty >= cap} onClick={() => onEdit(rl, { qty: rl.qty + 1 })}>+</button>
                  </div>
                  <select className="select" aria-label="Destino" disabled={busy} value={rl.destinationId ?? ''} onChange={(e) => onEdit(rl, { destinationId: e.target.value })}>
                    {destinations.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                  <button type="button" className="btn btn-danger" disabled={busy} onClick={() => onRemove(rl)}>Quitar</button>
                </div>
                <p className={styles.gray}>Motivo: {rl.reason}</p>
                <ReasonNote rl={rl} busy={busy} onEdit={onEdit} />
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
