import { formatMoney } from '../lib/labels.js';
import { SOURCE_LABELS } from '../lib/returns.js';
import styles from './ReturnPicker.module.css';

// Lo que vuelve: `lines` son las líneas de devolución de la operación.
// `onEdit(rl, { qty | destinationId | reasonNote })`, `onRemove(rl)`.
export default function ReturnLines({ lines, destinations = [], busy, onEdit, onRemove }) {
  return (
    <ul className={styles.linesList}>
      {(lines ?? []).map((rl, i) => {
        const cap = rl.source === 'manual' || rl.qtyBought == null ? Infinity : Math.max(0, rl.qtyBought - (rl.qtyReturnedBefore ?? 0));
        return (
          <li key={rl.lineId ?? rl.id ?? `${rl.purchaseLineId}-${i}`} className={styles.rl}>
            <div className={styles.rlTop}>
              <div className={styles.lineMain}>
                <p className={styles.name}>{rl.name}</p>
                <p className={styles.gray}>
                  {rl.sku} · {SOURCE_LABELS[rl.source] ?? rl.source}{rl.purchaseLabel || rl.purchaseId ? ` ${rl.purchaseLabel ?? rl.purchaseId}` : ''}
                </p>
              </div>
              <p className={`${styles.negative} num`}>− {formatMoney(rl.qty * rl.unitValue)}</p>
            </div>
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
            <input className="input" aria-label="Detalle del motivo" placeholder="Detalle del motivo" disabled={busy} value={rl.reasonNote ?? ''} onChange={(e) => onEdit(rl, { reasonNote: e.target.value })} />
          </li>
        );
      })}
    </ul>
  );
}
