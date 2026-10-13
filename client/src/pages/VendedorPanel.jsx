import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { getSession } from '../lib/session.js';
import { DELIVERY_LABELS, ORIGIN_LABELS, formatMoney } from '../lib/labels.js';
import { AppHeader, EmptyState, Notice } from '../components/ui.jsx';
import ProductSearch from '../components/ProductSearch.jsx';
import StockBadges from '../components/StockBadges.jsx';
import LineEditor, { availableFor, defaultLineValue } from '../components/LineEditor.jsx';
import CustomerForm, { EMPTY_CUSTOMER, customerErrors } from '../components/CustomerForm.jsx';
import ShippingFields, { EMPTY_SHIPPING, shippingAmount, shippingErrors } from '../components/ShippingFields.jsx';
import styles from './VendedorPanel.module.css';

const activeLinesOf = (cart) => (cart?.lines ?? []).filter((l) => l.status !== 'eliminado');

// Hoja inferior para agregar un producto o editar una línea del carrito.
// Los errores del servidor se muestran adentro, sin perder lo elegido.
function LineSheet({ product, line, locales, ownLocalId, onConfirm, onClose }) {
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

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={product ? 'Agregar al carrito' : 'Editar línea'} onClick={(e) => e.stopPropagation()}>
        <div className={styles.sheetHead}>
          <div className={styles.sheetTitle}>
            <p className={styles.sku}>{(product ?? line).sku}</p>
            <h2>{(product ?? line).name}</h2>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        {product && <StockBadges stock={product.stock} />}
        <LineEditor stock={product?.stock ?? null} locales={locales} ownLocalId={ownLocalId} value={value} onChange={setValue} />
        <Notice kind="error">{noStock ? 'Sin stock disponible en ninguna ubicación' : error}</Notice>
        <div className={styles.sheetActions}>
          <button type="button" className="btn btn-secondary btn-lg" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary btn-lg" onClick={confirm} disabled={saving || missingLocal || noStock}>
            {saving ? 'Guardando…' : product ? 'Agregar' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CartLine({ line, localName, busy, onlyLine, onQty, onEdit, onRemove }) {
  const promo = line.promoPrice != null && line.promoPrice < line.fullPrice;
  return (
    <li className={styles.line}>
      <div className={styles.lineMain}>
        <p className={styles.lineName}>{line.name}</p>
        <p className={styles.lineMeta}>
          {line.sku} · {ORIGIN_LABELS[line.origin]} · {DELIVERY_LABELS[line.delivery]}
          {line.delivery === 'retira_otro_local' && line.pickupLocalId ? ` (${localName(line.pickupLocalId)})` : ''}
        </p>
        <p className={`${styles.linePrice} num`}>
          {formatMoney(line.basePrice)}
          {promo && <s> {formatMoney(line.fullPrice)}</s>}
          {' '}× {line.qty} = <strong>{formatMoney(line.basePrice * line.qty)}</strong>
        </p>
      </div>
      <div className={styles.lineActions}>
        <div className={styles.qty}>
          <button type="button" className="btn btn-secondary" aria-label="Menos" disabled={busy || line.qty <= 1} onClick={() => onQty(line, line.qty - 1)}>−</button>
          <span className="num">{line.qty}</span>
          <button type="button" className="btn btn-secondary" aria-label="Más" disabled={busy} onClick={() => onQty(line, line.qty + 1)}>+</button>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onEdit(line)}>Editar</button>
        <button type="button" className="btn btn-danger btn-sm" disabled={busy || onlyLine} title={onlyLine ? 'Es la única línea: usá Vaciar carrito' : undefined} onClick={() => onRemove(line)}>Quitar</button>
        {onlyLine && <span className={styles.lineHint}>Única línea: usá Vaciar carrito</span>}
      </div>
    </li>
  );
}

export default function VendedorPanel() {
  const user = getSession('vendedor')?.user;
  const [config, setConfig] = useState(null);
  const [carts, setCarts] = useState([]);
  const [activeCartId, setActiveCartId] = useState(null);
  const [drafts, setDrafts] = useState({}); // cliente y envío por carrito
  const [notice, setNotice] = useState({ kind: 'error', text: '' });
  const [sent, setSent] = useState('');
  const [sheet, setSheet] = useState(null); // { product } | { line }
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([api('/config'), api('/carts')])
      .then(([cfg, mine]) => {
        if (!alive) return;
        setConfig(cfg);
        setCarts(mine);
        setActiveCartId(mine[0]?.id ?? null);
      })
      .catch((err) => alive && setNotice({ kind: 'error', text: err.message }))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const locales = config?.locales ?? [];
  const localName = useCallback((id) => locales.find((l) => l.id === id)?.name ?? id, [locales]);
  const payMethods = useMemo(
    () => (config?.paymentMethods ?? []).filter((m) => m.active !== false && m.discountPct > 0),
    [config],
  );

  const cart = carts.find((c) => c.id === activeCartId) ?? null;
  const lines = activeLinesOf(cart);
  const total = lines.reduce((sum, l) => sum + l.basePrice * l.qty, 0);
  const hasEnvio = lines.some((l) => l.delivery === 'envio');
  const draft = (cart && drafts[cart.id]) || { customer: EMPTY_CUSTOMER, shipping: EMPTY_SHIPPING };
  // Actualización funcional: lo que se escribe mientras una búsqueda está en vuelo no se pierde.
  // `change` es un objeto de campos o una función (último valor) -> campos.
  const draftUpdater = (id, key) => (change) => setDrafts((prev) => {
    const cur = prev[id] ?? { customer: EMPTY_CUSTOMER, shipping: EMPTY_SHIPPING };
    const fields = typeof change === 'function' ? change(cur[key]) : change;
    return { ...prev, [id]: { ...cur, [key]: { ...cur[key], ...fields } } };
  });

  // La respuesta del servidor trae el pedido completo: reemplaza al local.
  const putCart = (order) => setCarts((prev) => (prev.some((c) => c.id === order.id)
    ? prev.map((c) => (c.id === order.id ? order : c))
    : [...prev, order]));

  async function cartOp(fn) {
    setBusy(true);
    setNotice({ kind: 'error', text: '' });
    try {
      return await fn();
    } catch (err) {
      setNotice({ kind: 'error', text: err.message });
      return null;
    } finally {
      setBusy(false);
    }
  }

  const lineBody = (v) => ({
    productId: v.productId, qty: v.qty, origin: v.origin, delivery: v.delivery, pickupLocalId: v.pickupLocalId,
  });

  async function addLine(product, v) {
    const line = lineBody({ ...v, productId: product.productId });
    const order = cart
      ? await api(`/carts/${cart.id}/lines`, { method: 'POST', body: { line } })
      : await api('/carts', { method: 'POST', body: { line } });
    putCart(order);
    setActiveCartId(order.id);
    setSent('');
    setNotice({ kind: 'error', text: '' });
    setSheet(null);
  }

  async function editLine(line, v) {
    const order = await api(`/orders/${cart.id}/lines/${line.lineId}`, {
      method: 'PATCH',
      body: { qty: v.qty, origin: v.origin, delivery: v.delivery, pickupLocalId: v.pickupLocalId },
    });
    putCart(order);
    setNotice({ kind: 'error', text: '' });
    setSheet(null);
  }

  const changeQty = (line, qty) => cartOp(async () => {
    putCart(await api(`/orders/${cart.id}/lines/${line.lineId}`, { method: 'PATCH', body: { qty } }));
  });

  const removeLine = (line) => cartOp(async () => {
    putCart(await api(`/orders/${cart.id}/lines/${line.lineId}`, { method: 'DELETE' }));
  });

  const discard = () => cartOp(async () => {
    await api(`/carts/${cart.id}`, { method: 'DELETE' });
    setCarts((prev) => prev.filter((c) => c.id !== cart.id));
    setActiveCartId(null);
    setConfirmDiscard(false);
  });

  function submit() {
    const errors = [...customerErrors(draft.customer)];
    if (hasEnvio) errors.push(...shippingErrors(draft.shipping));
    if (errors.length) {
      setNotice({ kind: 'error', text: errors.join('. ') });
      return;
    }
    setSubmitting(true);
    cartOp(async () => {
      const body = { customer: draft.customer };
      if (hasEnvio) body.shipping = { ...draft.shipping, amount: shippingAmount(draft.shipping.amount).value };
      const order = await api(`/carts/${cart.id}/submit`, { method: 'POST', body });
      setCarts((prev) => prev.filter((c) => c.id !== cart.id));
      setActiveCartId(null);
      setSent(`${order.number ?? cart.number} enviado a caja`);
    }).finally(() => setSubmitting(false));
  }

  function selectCart(id) {
    setActiveCartId(id);
    setConfirmDiscard(false);
    setSent('');
    setNotice({ kind: 'error', text: '' });
  }

  const localLabel = locales.find((l) => l.id === user?.localId)?.name;

  return (
    <div className={styles.page}>
      <AppHeader panel="vendedor" userName={[user?.name, localLabel].filter(Boolean).join(' · ')} />
      <div className={styles.strip}>
        <p className={styles.who}>{[user?.name, localLabel].filter(Boolean).join(' · ')}</p>
        {carts.length > 0 && (
          <nav className={styles.carts} aria-label="Carritos abiertos">
            {carts.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`${styles.cartTab} ${c.id === activeCartId ? styles.cartTabOn : ''}`}
                aria-current={c.id === activeCartId ? 'true' : undefined}
                onClick={() => selectCart(c.id)}
              >
                {c.number}
              </button>
            ))}
          </nav>
        )}
        {cart && <button type="button" className="btn btn-secondary btn-sm" onClick={() => selectCart(null)}>Nuevo cliente</button>}
      </div>

      <main className={styles.main}>
        <div className={styles.searchCol}>
          {loading ? <p>Cargando…</p> : <ProductSearch payMethods={payMethods} onPick={(product) => setSheet({ product })} />}
        </div>

        <aside className={styles.cartCol} aria-label="Carrito">
          <h2 className={styles.cartTitle}>{cart ? `Carrito ${cart.number}` : 'Carrito'}</h2>
          {sent && <div className={styles.sent} role="status">{sent}</div>}
          <Notice kind={notice.kind} onClose={notice.text ? () => setNotice({ kind: 'error', text: '' }) : undefined}>{notice.text}</Notice>

          {!cart && !sent && <EmptyState title="Carrito vacío">Buscá un producto y tocá Agregar.</EmptyState>}

          {cart && (
            <>
              <ul className={styles.lines}>
                {lines.map((l) => (
                  <CartLine key={l.lineId} line={l} localName={localName} busy={busy} onlyLine={lines.length <= 1} onQty={changeQty} onEdit={(line) => setSheet({ line })} onRemove={removeLine} />
                ))}
              </ul>

              {hasEnvio && <ShippingFields value={draft.shipping} onChange={draftUpdater(cart.id, 'shipping')} />}
              <CustomerForm
                key={cart.id}
                value={draft.customer}
                onChange={draftUpdater(cart.id, 'customer')}
                decoradorTagId={config?.settings?.decoradorTagId}
              />

              {confirmDiscard ? (
                <div className={styles.confirm} role="alertdialog" aria-label="Vaciar carrito">
                  <p>¿Vaciar el carrito {cart.number}? Se descartan todas sus líneas.</p>
                  <div className={styles.confirmActions}>
                    <button type="button" className="btn btn-secondary" onClick={() => setConfirmDiscard(false)}>No, volver</button>
                    <button type="button" className="btn btn-danger" disabled={busy} onClick={discard}>Sí, vaciar</button>
                  </div>
                </div>
              ) : (
                <button type="button" className="btn btn-ghost" onClick={() => setConfirmDiscard(true)}>Vaciar carrito</button>
              )}
            </>
          )}
        </aside>
      </main>

      <footer className={styles.bar}>
        <div>
          <p className={styles.barLabel}>Total productos</p>
          <p className={`${styles.barTotal} num`}>{formatMoney(total)}</p>
        </div>
        <button type="button" className="btn btn-primary btn-lg" disabled={busy || !cart || lines.length === 0} onClick={submit}>
          {submitting ? 'Enviando…' : 'Enviar a caja'}
        </button>
      </footer>

      {sheet && (
        <LineSheet
          key={sheet.product?.productId ?? sheet.line.lineId}
          product={sheet.product}
          line={sheet.line}
          locales={locales}
          ownLocalId={user?.localId}
          onConfirm={(v) => (sheet.product ? addLine(sheet.product, v) : editLine(sheet.line, v))}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}
