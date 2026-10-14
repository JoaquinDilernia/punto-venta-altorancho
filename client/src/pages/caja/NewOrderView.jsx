import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api.js';
import { formatMoney } from '../../lib/labels.js';
import { EmptyState, Notice } from '../../components/ui.jsx';
import ProductSearch from '../../components/ProductSearch.jsx';
import CustomerForm, { EMPTY_CUSTOMER, customerErrors } from '../../components/CustomerForm.jsx';
import ShippingFields, { EMPTY_SHIPPING, shippingErrors } from '../../components/ShippingFields.jsx';
import { LineDialog, LineRow, activeLinesOf, lineBody } from './lineParts.jsx';
import { parseMoney } from './money.js';
import styles from './caja.module.css';

// Pedido nuevo armado en el mostrador: mismo flujo que el vendedor (carrito ->
// cliente -> enviar a caja) en layout de escritorio. Al enviarlo se abre en
// "Pedidos" para cobrarlo. El carrito vive en el servidor; CajaPanel mantiene
// esta vista montada para no perder lo tipeado al cambiar de sección.
export default function NewOrderView({ config, localId, scope, onSubmitted }) {
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState(EMPTY_CUSTOMER);
  const [shipping, setShipping] = useState(EMPTY_SHIPPING);
  const [dialog, setDialog] = useState(null); // { product } | { line }
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const locales = config.locales ?? [];
  const localName = useCallback((id) => locales.find((l) => l.id === id)?.name ?? id, [locales]);
  const payMethods = useMemo(() => (config.paymentMethods ?? []).filter((m) => m.active !== false && m.discountPct > 0), [config]);

  // Si había un carrito abierto (otra pestaña, recarga) se retoma el más viejo.
  useEffect(() => {
    let alive = true;
    // El admin no tiene carritos propios por local: arranca vacío.
    (scope ? Promise.resolve([]) : api('/carts'))
      .then((mine) => { if (alive) setCart(mine[0] ?? null); })
      .catch((err) => alive && setNotice(err.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [scope]);

  const lines = activeLinesOf(cart);
  const hasEnvio = lines.some((l) => l.delivery === 'envio');
  const total = lines.reduce((sum, l) => sum + l.basePrice * l.qty, 0);
  // Actualización funcional: lo que se escribe mientras una búsqueda está en vuelo no se pierde.
  const updater = (setter) => (change) => setter((prev) => ({ ...prev, ...(typeof change === 'function' ? change(prev) : change) }));

  async function op(fn) {
    setBusy(true);
    setNotice('');
    try {
      return await fn();
    } catch (err) {
      setNotice(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function addLine(product, v) {
    const line = lineBody({ ...v, productId: product.productId });
    const order = cart
      ? await api(`/carts/${cart.id}/lines`, { method: 'POST', body: { line } })
      : await api('/carts', { method: 'POST', body: scope ? { line, localId: scope } : { line } });
    setCart(order);
    setNotice('');
    setDialog(null);
  }
  async function editLine(line, v) {
    setCart(await api(`/orders/${cart.id}/lines/${line.lineId}`, {
      method: 'PATCH', body: { qty: v.qty, origin: v.origin, delivery: v.delivery, pickupLocalId: v.pickupLocalId },
    }));
    setNotice('');
    setDialog(null);
  }
  const changeQty = (line, qty) => op(async () => setCart(await api(`/orders/${cart.id}/lines/${line.lineId}`, { method: 'PATCH', body: { qty } })));
  const removeLine = (line) => op(async () => setCart(await api(`/orders/${cart.id}/lines/${line.lineId}`, { method: 'DELETE' })));

  function resetForm() {
    setCart(null);
    setCustomer(EMPTY_CUSTOMER);
    setShipping(EMPTY_SHIPPING);
    setConfirmDiscard(false);
  }

  const discard = () => op(async () => {
    await api(`/carts/${cart.id}`, { method: 'DELETE' });
    resetForm();
  });

  async function submit() {
    const errors = [...customerErrors(customer)];
    if (hasEnvio) errors.push(...shippingErrors(shipping));
    if (errors.length) { setNotice(errors.join('. ')); return; }
    const body = { customer };
    if (hasEnvio) body.shipping = { ...shipping, amount: parseMoney(shipping.amount).value };
    const order = await op(() => api(`/carts/${cart.id}/submit`, { method: 'POST', body }));
    if (!order) return;
    resetForm();
    onSubmitted(order.id);
  }

  return (
    <div className={styles.view}>
      <header className={styles.viewHead}>
        <h1 className={styles.viewTitle}>Nuevo pedido{cart ? ` ${cart.number}` : ''}</h1>
      </header>
      <div className={styles.newGrid}>
        <div className={styles.newSearch}>
          {loading ? <p className={styles.muted}>Cargando…</p> : <ProductSearch payMethods={payMethods} localId={scope} onPick={(product) => setDialog({ product })} />}
        </div>

        <section className={styles.newCart} aria-label="Carrito">
          <Notice kind="error" onClose={notice ? () => setNotice('') : undefined}>{notice}</Notice>
          {!cart && <EmptyState title="Carrito vacío">Buscá un producto y tocá Agregar.</EmptyState>}
          {cart && (
            <>
              <ul className={styles.lines}>
                {lines.map((l) => (
                  <LineRow key={l.lineId} line={l} localName={localName} busy={busy} onlyLine={lines.length <= 1} onQty={changeQty} onEdit={(line) => setDialog({ line })} onRemove={removeLine} />
                ))}
              </ul>
              <p className={`${styles.cartTotal} num`}>Total productos <strong>{formatMoney(total)}</strong></p>
              {hasEnvio && <ShippingFields value={shipping} onChange={updater(setShipping)} />}
              <CustomerForm key={cart.id} value={customer} onChange={updater(setCustomer)} decoradorTagId={config.settings?.decoradorTagId} />
              <div className={styles.rowActions}>
                <button type="button" className="btn btn-primary btn-lg" disabled={busy || lines.length === 0} onClick={submit}>{busy ? 'Enviando…' : 'Enviar a caja y cobrar'}</button>
                {confirmDiscard ? (
                  <>
                    <button type="button" className="btn btn-danger" disabled={busy} onClick={discard}>Sí, vaciar</button>
                    <button type="button" className="btn btn-ghost" onClick={() => setConfirmDiscard(false)}>No, volver</button>
                  </>
                ) : (
                  <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setConfirmDiscard(true)}>Vaciar carrito</button>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {dialog && (
        <LineDialog
          key={dialog.product?.productId ?? dialog.line.lineId}
          product={dialog.product}
          line={dialog.line}
          locales={locales}
          ownLocalId={localId}
          onConfirm={(v) => (dialog.product ? addLine(dialog.product, v) : editLine(dialog.line, v))}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
