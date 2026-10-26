import { useEffect, useRef, useState } from 'react';
import { formatMoney } from '../../lib/labels.js';
import { round2 } from '../../lib/format.js';
import { moneyText, parseMoney } from './money.js';
import styles from './caja.module.css';

const emptyRow = () => ({ methodId: '', amount: '' });
const sumOf = (refund) => round2((refund?.cashBack ?? []).reduce((s, c) => s + (Number(c.amount) || 0), 0) + (Number(refund?.credit) || 0));
const keyOf = (refund) => JSON.stringify([(refund?.cashBack ?? []).map((c) => [c.methodId, round2(Number(c.amount) || 0)]), round2(Number(refund?.credit) || 0)]);
const allCredit = (amount) => ({ cashBack: [], credit: round2(amount) });

function modeOf(value) {
  const back = value?.cashBack ?? [];
  if (!back.length) return 'credit';
  if (back.length === 1 && !(value.credit > 0)) return 'cash';
  return 'split';
}

// Neto negativo: cómo se le devuelve al cliente `amount` (= −neto). Por
// defecto todo como saldo a favor; o reintegro por un medio; o dividido.
// `methods`: medios activos sin "saldo". `value`: refund guardado.
// `onSave(refund)` hace el PATCH (devuelve la respuesta o null).
// `onDirtyChange(pending)`: hay un reintegro elegido sin guardar.
export default function RefundBox({ amount, methods, value, disabled, onSave, onDirtyChange }) {
  const [mode, setMode] = useState(() => modeOf(value));
  const [cashMethod, setCashMethod] = useState(() => (modeOf(value) === 'cash' ? value.cashBack[0].methodId : ''));
  const [rows, setRows] = useState(() => (modeOf(value) === 'split'
    ? value.cashBack.map((c) => ({ methodId: c.methodId, amount: moneyText(c.amount) }))
    : [emptyRow()]));
  const [credit, setCredit] = useState(() => (modeOf(value) === 'split' ? moneyText(value.credit || '') : ''));

  const due = round2(amount);
  const savedOk = Boolean(value) && Math.abs(sumOf(value) - due) < 0.01;

  // Sin nada guardado (o con "todo saldo" y otro monto) se guarda solo el
  // valor por defecto: todo como saldo a favor.
  const autoSaved = useRef(null);
  useEffect(() => {
    if (disabled || !(due > 0) || autoSaved.current === due) return;
    if (!value || (modeOf(value) === 'credit' && !savedOk)) {
      autoSaved.current = due;
      onSave(allCredit(due));
    }
  });

  // ---- Lo que se está armando ----
  const parsedRows = rows.map((r) => ({ r, a: parseMoney(r.amount) }));
  const creditParsed = parseMoney(credit);
  let draft = null;
  if (mode === 'credit') draft = allCredit(due);
  else if (mode === 'cash') draft = cashMethod ? { cashBack: [{ methodId: cashMethod, amount: due }], credit: 0 } : null;
  else {
    const filled = parsedRows.filter(({ r }) => r.methodId || r.amount.trim());
    const rowsOk = filled.every(({ r, a }) => r.methodId && a.ok && a.value > 0);
    const creditOk = !credit.trim() || (creditParsed.ok && creditParsed.value >= 0);
    const dupes = new Set(filled.map(({ r }) => r.methodId)).size !== filled.length;
    draft = rowsOk && creditOk && !dupes
      ? { cashBack: filled.map(({ r, a }) => ({ methodId: r.methodId, amount: round2(a.value) })), credit: credit.trim() ? round2(creditParsed.value) : 0 }
      : null;
  }
  const draftSum = mode === 'split'
    ? round2(parsedRows.reduce((s, { a }) => s + (a.ok ? a.value : 0), 0) + (creditParsed.ok ? creditParsed.value : 0))
    : due;
  const exact = Math.abs(draftSum - due) < 0.01;
  const dirty = !draft || keyOf(draft) !== keyOf(value);
  const canSave = !disabled && Boolean(draft) && exact && dirty;
  // Reintegro o división a medio armar: lo guardado no es lo que se ve.
  const pending = mode !== 'credit' && dirty;
  useEffect(() => { onDirtyChange?.(pending); }, [pending]); // avisa solo cuando cambia
  useEffect(() => () => onDirtyChange?.(false), []); // al desmontar, nada pendiente

  async function save(refund) {
    await onSave(refund); // los errores del servidor se ven en el cobro (payError)
  }
  function allToCredit() {
    setMode('credit');
    save(allCredit(due));
  }
  function allToCash() {
    setMode('cash');
    if (cashMethod) save({ cashBack: [{ methodId: cashMethod, amount: due }], credit: 0 });
  }
  function chooseCashMethod(id) {
    setCashMethod(id);
    if (id) save({ cashBack: [{ methodId: id, amount: due }], credit: 0 });
  }
  function startSplit() {
    setMode('split');
    if (!rows.some((r) => r.methodId || r.amount)) setRows([{ methodId: cashMethod, amount: '' }]);
  }
  const setRow = (i, change) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...change } : r)));
  function fillCredit() {
    const back = parsedRows.reduce((s, { a }) => s + (a.ok ? a.value : 0), 0);
    setCredit(moneyText(round2(Math.max(0, due - back))));
  }

  const used = new Set(rows.map((r) => r.methodId).filter(Boolean));

  return (
    <section className={styles.paySection} aria-label="Cómo se devuelve">
      <h3 className={styles.sectionLabel}>Cómo se le devuelve {formatMoney(due)}</h3>
      <div className={styles.methodGrid}>
        <button type="button" className={`${styles.method} ${mode === 'credit' ? styles.methodOn : ''}`} aria-pressed={mode === 'credit'} disabled={disabled} onClick={allToCredit}>
          {mode === 'credit' && <span aria-hidden="true">✓ </span>}Todo saldo a favor
        </button>
        <button type="button" className={`${styles.method} ${mode === 'cash' ? styles.methodOn : ''}`} aria-pressed={mode === 'cash'} disabled={disabled} onClick={allToCash}>
          {mode === 'cash' && <span aria-hidden="true">✓ </span>}Todo reintegro
        </button>
      </div>

      {mode === 'cash' && (
        <label className="field">
          <span className="field-label">Medio del reintegro</span>
          <select className="select" value={cashMethod} disabled={disabled} onChange={(e) => chooseCashMethod(e.target.value)}>
            <option value="">Elegí…</option>
            {methods.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
      )}

      {mode !== 'split' ? (
        <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={startSplit}>Dividir</button>
      ) : (
        <>
          {rows.map((r, i) => (
            <div key={i} className={styles.splitRow}>
              <select className="select select-sm" aria-label="Medio del reintegro" value={r.methodId} disabled={disabled} onChange={(e) => setRow(i, { methodId: e.target.value })}>
                <option value="">Medio…</option>
                {methods.map((m) => <option key={m.id} value={m.id} disabled={m.id !== r.methodId && used.has(m.id)}>{m.label}</option>)}
              </select>
              <input className="input input-sm num" inputMode="decimal" aria-label="Monto del reintegro" placeholder="Monto" value={r.amount} disabled={disabled} onChange={(e) => setRow(i, { amount: e.target.value })} />
              {rows.length > 1 && <button type="button" className="btn btn-ghost btn-sm" aria-label="Quitar fila" disabled={disabled} onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}>×</button>}
            </div>
          ))}
          <button type="button" className="btn btn-secondary btn-sm" disabled={disabled || rows.length >= methods.length} onClick={() => setRows((prev) => [...prev, emptyRow()])}>Agregar medio</button>
          <div className={styles.splitRow}>
            <label className="field">
              <span className="field-label">Saldo a favor</span>
              <input className="input input-sm num" inputMode="decimal" aria-label="Saldo a favor" placeholder="0" value={credit} disabled={disabled} onChange={(e) => setCredit(e.target.value)} />
            </label>
            <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={fillCredit}>Completar con saldo</button>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={allToCredit}>Volver a todo saldo a favor</button>
        </>
      )}

      <p className={`${styles.assign} num ${exact ? styles.assignOk : styles.assignBad}`} role="status">
        Suma {formatMoney(draftSum)} de {formatMoney(due)}{exact ? '' : ' — tiene que sumar exacto'}
      </p>
      {mode !== 'credit' && (
        <button type="button" className="btn btn-primary btn-sm" disabled={!canSave} onClick={() => save(draft)}>Guardar reintegro</button>
      )}
      {mode === 'cash' && !cashMethod && <p className={styles.hint}>Elegí el medio para guardar el reintegro</p>}
      {pending && <p className={styles.assignBad} role="status">Sin guardar: tocá "Guardar reintegro" (o volvé a todo saldo a favor)</p>}
    </section>
  );
}

// ¿El reintegro guardado cubre exactamente lo que hay que devolver?
export const refundCovers = (refund, amount) => Boolean(refund) && Math.abs(sumOf(refund) - round2(amount)) < 0.01;
