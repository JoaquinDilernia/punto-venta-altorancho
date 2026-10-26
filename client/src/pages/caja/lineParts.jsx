import { useEffect, useState } from 'react';
import { DELIVERY_LABELS, ORIGIN_LABELS, formatMoney } from '../../lib/labels.js';
import { Chip, Notice } from '../../components/ui.jsx';
import StockBadges from '../../components/StockBadges.jsx';
import LineEditor, { availableFor, defaultLineValue } from '../../components/LineEditor.jsx';
import { KIND_LABELS } from '../../lib/returns.js';
import styles from './caja.module.css';

export const activeLinesOf = (order) => (order?.lines ?? []).filter((l) => l.status !== 'eliminado');

export const lineBody = (v) => ({
  productId: v.productId, qty: v.qty, origin: v.origin, delivery: v.delivery, pickupLocalId: v.pickupLocalId,
});

// Diálogo para agregar un producto (con `product`) o editar una línea (con `line`).
// Los errores del servidor se muestran adentro sin perder lo elegido.
export function LineDialog({ product, line, locales, ownLocalId, onConfirm, onClose }) {
  const [value, setValue] = useState(() => (product
    ? defaultLineValue(product.stock)
    : { qty: line.qty, origin: line.origin, delivery: line.delivery, pickupLocalId: line.pickupLocalId ?? null }));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const missingLocal = value.delivery === 'retira_otro_local' && !value.pickupLocalId;
  const noStock = Boolean(product) && availableFor(product.stock, value.origin) === 0;

  async function confirm() {
    setSaving(true);
    setError('');
    try {
      await onConfirm({ ...value, pickupLocalId: value.delivery === 'retira_otro_local' ? value.pickupLocalId : null });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  const shown = product ?? line;
  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label={product ? 'Agregar producto' : 'Editar línea'} onClick={(e) => e.stopPropagation()}>
        <div className={styles.dialogHead}>
          <div>
            <p className={styles.muted}>{shown.sku}</p>
            <h2 className={styles.dialogTitle}>{shown.name}</h2>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        {product && <StockBadges stock={product.stock} />}
        <LineEditor stock={product?.stock ?? null} locales={locales} ownLocalId={ownLocalId} value={value} onChange={setValue} />
        <Notice kind="error">{noStock ? 'Sin stock disponible en ninguna ubicación' : error}</Notice>
        <div className={styles.dialogActions}>
          <button type="button" className="btn btn-secondary btn-lg" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary btn-lg" onClick={confirm} disabled={saving || missingLocal || noStock}>
            {saving ? 'Guardando…' : product ? 'Agregar' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Una línea del pedido: cantidad editable, origen/entrega, quitar.
export function LineRow({ line, localName, busy, onlyLine, readOnly, onQty, onEdit, onRemove }) {
  const promo = line.promoPrice != null && line.promoPrice < line.fullPrice;
  return (
    <li className={styles.line}>
      <div className={styles.lineMain}>
        <p className={styles.lineName}>{line.name}</p>
        <p className={styles.muted}>
          {line.sku} · {ORIGIN_LABELS[line.origin]} · {DELIVERY_LABELS[line.delivery]}
          {line.delivery === 'retira_otro_local' && line.pickupLocalId ? ` (${localName(line.pickupLocalId)})` : ''}
          {line.status === 'entregado' && <> <Chip tone="done">Entregado</Chip></>}
        </p>
        <p className={`${styles.muted} num`}>
          {formatMoney(line.basePrice)}
          {promo && <s> {formatMoney(line.fullPrice)}</s>}
        </p>
      </div>
      {readOnly ? (
        <p className={`${styles.lineTotal} num`}>{line.qty} × {formatMoney(line.basePrice)} = <strong>{formatMoney(line.basePrice * line.qty)}</strong></p>
      ) : (
        <div className={styles.lineActions}>
          <div className={styles.qty}>
            <button type="button" className="btn btn-secondary btn-sm" aria-label="Menos" disabled={busy || line.qty <= 1} onClick={() => onQty(line, line.qty - 1)}>−</button>
            <span className="num">{line.qty}</span>
            <button type="button" className="btn btn-secondary btn-sm" aria-label="Más" disabled={busy} onClick={() => onQty(line, line.qty + 1)}>+</button>
          </div>
          <strong className={`${styles.lineTotal} num`}>{formatMoney(line.basePrice * line.qty)}</strong>
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onEdit(line)}>Origen y entrega</button>
          <button type="button" className="btn btn-danger btn-sm" disabled={busy || onlyLine} title={onlyLine ? 'Es la última línea: no se puede quitar' : undefined} onClick={() => onRemove(line)}>Quitar</button>
        </div>
      )}
    </li>
  );
}

// Etiqueta del tipo de operación (texto, no solo color).
export function KindTag({ kind }) {
  const k = kind ?? 'venta';
  return <span className={`${styles.kindTag} ${k !== 'venta' ? styles.kindTagReturn : ''}`}>{KIND_LABELS[k] ?? k}</span>;
}
