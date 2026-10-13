import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { getSession } from '../../lib/session.js';
import { formatMoney } from '../../lib/labels.js';
import { formatDateTime } from '../../lib/format.js';
import { Notice, OrderStatusChip } from '../../components/ui.jsx';
import ProductSearch from '../../components/ProductSearch.jsx';
import CustomerForm, { EMPTY_CUSTOMER, customerErrors } from '../../components/CustomerForm.jsx';
import ShippingFields, { EMPTY_SHIPPING, shippingErrors } from '../../components/ShippingFields.jsx';
import PaymentBox from './PaymentBox.jsx';
import { LineDialog, LineRow, activeLinesOf, lineBody } from './lineParts.jsx';
import { moneyText, parseMoney } from './money.js';
import styles from './caja.module.css';

const hasOdoo = (o) => Boolean(o.odooOrderId || o.odooOrders?.length);
const CASH_CLOSED = 'caja del local está cerrada';

// ---- Borradores de cliente y envío (se guardan con un botón) ----
const customerDraft = (c) => ({
  ...EMPTY_CUSTOMER,
  ...(c ?? {}),
  street: c?.street ?? '', city: c?.city ?? '', zip: c?.zip ?? '', tagIds: c?.tagIds ?? [],
});
const normCustomer = (c) => JSON.stringify([
  String(c?.docNumber ?? '').replace(/\D/g, ''), (c?.name ?? '').trim(), (c?.phone ?? '').trim(), (c?.email ?? '').trim(),
  (c?.street ?? '').trim(), (c?.city ?? '').trim(), (c?.zip ?? '').trim(), c?.afipResponsibility ?? null,
  Boolean(c?.fromArca), c?.odooPartnerId ?? null, (c?.tagIds ?? []).map(Number),
]);
const shippingDraft = (s) => ({
  ...EMPTY_SHIPPING,
  ...Object.fromEntries(Object.entries(s ?? {}).filter(([k]) => k !== 'amount').map(([k, v]) => [k, v ?? ''])),
  amount: moneyText(s?.amount),
});
const SHIP_KEYS = ['street', 'number', 'floor', 'city', 'zip', 'phone', 'notes'];
const normShipping = (s, amount) => JSON.stringify([...SHIP_KEYS.map((k) => String(s?.[k] ?? '').trim()), amount]);

// Funciona con el objeto de campos o con una función (último valor) -> campos.
const draftUpdater = (setter) => (change) => setter((prev) => ({ ...prev, ...(typeof change === 'function' ? change(prev) : change) }));

// Pedido de caja: líneas, cliente, envío y cobro. Sirve para la cola y para el
// historial. Los totales los calcula siempre el servidor (`preview`).
export default function OrderDetail({ orderId, config, backLabel, onBack, onGoCash, onChanged }) {
  const user = getSession('caja')?.user;
  const [data, setData] = useState(null); // { order, preview }
  const [loadError, setLoadError] = useState('');
  const [customer, setCustomer] = useState(null);
  const [shipping, setShipping] = useState(null);
  const [notes, setNotes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState({ kind: 'error', text: '' });
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState(null);
  const [dialog, setDialog] = useState(null); // { product } | { line }
  const [annul, setAnnul] = useState(null); // null | { reason }
  const seq = useRef(0);

  const locales = config.locales ?? [];
  const localName = useCallback((id) => locales.find((l) => l.id === id)?.name ?? id, [locales]);

  // Solo vale la última respuesta: si llegan fuera de orden se descartan las viejas.
  const load = useCallback(async () => {
    const id = ++seq.current;
    try {
      const res = await api(`/orders/${orderId}`);
      if (id !== seq.current) return null;
      setData(res);
      setLoadError('');
      setCustomer((prev) => prev ?? customerDraft(res.order.customer));
      setShipping((prev) => prev ?? shippingDraft(res.order.shipping));
      setNotes((prev) => prev ?? (res.order.notes ?? ''));
      return res;
    } catch (err) {
      if (id === seq.current) setLoadError(err.message);
      return null;
    }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  // Ejecuta un cambio y vuelve a pedir el pedido (y su preview). Devuelve la
  // respuesta del GET, o null si el cambio falló.
  async function mutate(fn) {
    setBusy(true);
    setNotice({ kind: 'error', text: '' });
    try {
      await fn();
      return await load();
    } catch (err) {
      setNotice({ kind: 'error', text: err.message });
      await load();
      return null;
    } finally {
      setBusy(false);
    }
  }
  const patch = (body) => mutate(() => api(`/orders/${orderId}`, { method: 'PATCH', body }));

  const order = data?.order ?? null;
  const preview = data?.preview ?? null;

  const lines = useMemo(() => activeLinesOf(order), [order]);
  const status = order?.status;
  const inOdoo = order ? hasOdoo(order) : false;
  const draftStatus = status === 'pendiente' || status === 'error';
  const editable = draftStatus && !inOdoo;
  const locale = locales.find((l) => l.id === order?.localId);
  const needsShipping = lines.some((l) => l.delivery === 'envio');

  async function addLine(product, v) {
    await api(`/orders/${orderId}/lines`, { method: 'POST', body: { line: lineBody({ ...v, productId: product.productId }) } });
    await load();
    setDialog(null);
  }
  async function editLine(line, v) {
    await api(`/orders/${orderId}/lines/${line.lineId}`, {
      method: 'PATCH', body: { qty: v.qty, origin: v.origin, delivery: v.delivery, pickupLocalId: v.pickupLocalId },
    });
    await load();
    setDialog(null);
  }
  const changeQty = (line, qty) => mutate(() => api(`/orders/${orderId}/lines/${line.lineId}`, { method: 'PATCH', body: { qty } }));
  const removeLine = (line) => mutate(() => api(`/orders/${orderId}/lines/${line.lineId}`, { method: 'DELETE' }));

  async function saveCustomer() {
    const errors = customerErrors(customer);
    if (errors.length) { setNotice({ kind: 'error', text: errors.join('. ') }); return; }
    await patch({ customer });
  }
  async function saveShipping() {
    const errors = shippingErrors(shipping);
    if (errors.length) { setNotice({ kind: 'error', text: errors.join('. ') }); return; }
    await patch({ shipping: { ...shipping, amount: parseMoney(shipping.amount).value } });
  }
  const saveNotes = () => patch({ notes });

  async function confirm() {
    setConfirming(true);
    setConfirmError(null);
    setNotice({ kind: 'error', text: '' });
    try {
      await api(`/orders/${orderId}/confirm`, { method: 'POST' });
      await load();
      onChanged?.();
    } catch (err) {
      // 409: no se pudo reclamar el pedido (p. ej. caja cerrada); 502: falló Odoo.
      setConfirmError({ message: err.message, cashClosed: err.status === 409 && err.message.includes(CASH_CLOSED) });
      await load(); // puede haber quedado en estado "error" con su detalle
      onChanged?.();
    } finally {
      setConfirming(false);
    }
  }

  async function retryInvoice() {
    await mutate(() => api(`/orders/${orderId}/invoice`, { method: 'POST' }));
    onChanged?.();
  }

  async function doAnnul() {
    const reason = annul.reason.trim();
    if (!reason) { setNotice({ kind: 'error', text: 'Escribí el motivo de la anulación' }); return; }
    const res = await mutate(() => api(`/orders/${orderId}/annul`, { method: 'POST', body: { reason } }));
    if (res?.order?.status === 'anulado') { setAnnul(null); onChanged?.(); }
  }

  if (!order) {
    return (
      <div className={styles.detailLoading}>
        <button type="button" className="btn btn-ghost" onClick={onBack}>← {backLabel}</button>
        {loadError ? <Notice kind="error">{loadError}</Notice> : <p className={styles.muted}>Cargando pedido…</p>}
      </div>
    );
  }

  const customerDirty = editable && normCustomer(customer) !== normCustomer(order.customer);
  const shippingParsed = parseMoney(shipping.amount);
  const shippingDirty = editable && needsShipping
    && normShipping(shipping, shippingParsed.ok ? shippingParsed.value : null) !== normShipping(order.shipping, order.shipping?.amount ?? null);
  const blockers = [];
  if (customerDirty) blockers.push('Guardá los cambios del cliente');
  if (editable && needsShipping && (shippingDirty || !order.shipping)) blockers.push('Guardá los datos del envío');
  if (editable && !order.customer) blockers.push('Falta cargar el cliente');
  const notesDirty = notes !== (order.notes ?? '');
  const canAnnul = ['pendiente', 'error', 'confirmado'].includes(status);
  const canRetryInvoice = status === 'confirmado' && order.wantsInvoice && !order.invoiceName && locale?.invoices !== false;

  return (
    <div className={styles.detail}>
      <header className={styles.detailHead}>
        <button type="button" className="btn btn-ghost" onClick={onBack}>← {backLabel}</button>
        <h1 className={styles.viewTitle}>Pedido {order.number}</h1>
        <OrderStatusChip status={status} large />
        <span className={styles.muted}>
          {order.sellerName} · enviado {formatDateTime(order.sentAt ?? order.createdAt)}
        </span>
      </header>

      <Notice kind={notice.kind} onClose={notice.text ? () => setNotice({ kind: 'error', text: '' }) : undefined}>{notice.text}</Notice>
      <Notice kind="error">{loadError}</Notice>

      {status === 'confirmado' && (
        <section className={styles.result} aria-label="Resultado de la venta">
          <p className={styles.resultKicker}>Venta confirmada en Odoo</p>
          <p className={`${styles.resultOdoo} num`}>{order.odooOrderName || '—'}</p>
          <p className={styles.resultLine}>
            {order.invoiceName
              ? <>Factura <strong>{order.invoiceName}</strong></>
              : order.wantsInvoice ? 'Con factura: todavía sin emitir' : 'Sin factura'}
          </p>
          {order.invoiceError && <p className={styles.resultError}>No se pudo facturar: {order.invoiceError}</p>}
          {order.warning && <p className={styles.resultWarning} role="alert">{order.warning}</p>}
        </section>
      )}
      {status === 'error' && (
        <section className={styles.errorBox} role="alert">
          <p className={styles.resultKicker}>No se pudo confirmar</p>
          <p>{order.errorDetail || 'Falló la confirmación en Odoo.'}</p>
          {inOdoo && <p>Ya existe en Odoo como <strong>{order.odooOrderName}</strong>: no se puede editar, solo reintentar.</p>}
          {order.warning && <p className={styles.resultWarning}>{order.warning}</p>}
        </section>
      )}
      {status === 'anulado' && (
        <Notice kind="info">Venta anulada{order.annulledBy ? ` por ${order.annulledBy}` : ''}{order.annulReason ? `: ${order.annulReason}` : ''}.</Notice>
      )}
      {status === 'pendiente' && inOdoo && (
        <Notice kind="info">Este pedido ya existe en Odoo ({order.odooOrderName}): no se puede editar.</Notice>
      )}

      <div className={styles.detailGrid}>
        <div className={styles.detailMain}>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Productos</h2>
            <ul className={styles.lines}>
              {lines.map((l) => (
                <LineRow
                  key={l.lineId}
                  line={l}
                  localName={localName}
                  busy={busy || confirming}
                  readOnly={!editable}
                  onlyLine={lines.length <= 1}
                  onQty={changeQty}
                  onEdit={(line) => setDialog({ line })}
                  onRemove={removeLine}
                />
              ))}
            </ul>
            {editable && (
              <details className={styles.addBox}>
                <summary className="btn btn-secondary btn-sm">Agregar producto</summary>
                <ProductSearch
                  payMethods={[]}
                  onPick={(product) => setDialog({ product })}
                />
              </details>
            )}
          </section>

          {editable && needsShipping && (
            <div className={styles.saveBlock}>
              <ShippingFields value={shipping} onChange={draftUpdater(setShipping)} />
              <button type="button" className="btn btn-secondary" disabled={busy || confirming || !shippingDirty} onClick={saveShipping}>Guardar envío</button>
            </div>
          )}
          {!editable && order.shipping && (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Envío a domicilio</h2>
              <p>{order.shipping.street} {order.shipping.number}{order.shipping.floor ? `, ${order.shipping.floor}` : ''} · {order.shipping.city} ({order.shipping.zip}) · Tel. {order.shipping.phone}</p>
              {order.shipping.notes && <p className={styles.muted}>{order.shipping.notes}</p>}
              <p className={styles.muted}>Costo: {formatMoney(order.shipping.amount)}</p>
            </section>
          )}

          {editable ? (
            <div className={styles.saveBlock}>
              <CustomerForm value={customer} onChange={draftUpdater(setCustomer)} decoradorTagId={config.settings?.decoradorTagId} />
              <button type="button" className="btn btn-secondary" disabled={busy || confirming || !customerDirty} onClick={saveCustomer}>Guardar cliente</button>
            </div>
          ) : order.customer && (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Cliente</h2>
              <p><strong>{order.customer.name}</strong> · DNI/CUIT {order.customer.docNumber}</p>
              <p className={styles.muted}>{[order.customer.phone, order.customer.email, order.customer.street, order.customer.city].filter(Boolean).join(' · ')}</p>
            </section>
          )}

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Notas</h2>
            <textarea className="input" rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones del pedido" disabled={!draftStatus && status !== 'confirmado'} />
            {(draftStatus ? !inOdoo : status === 'confirmado') && (
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !notesDirty} onClick={saveNotes}>Guardar notas</button>
            )}
          </section>

          {(canAnnul || canRetryInvoice) && (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Acciones</h2>
              {canRetryInvoice && (
                <div className={styles.actionRow}>
                  {order.invoiceError && <Notice kind="error">{order.invoiceError}</Notice>}
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={retryInvoice}>{busy ? 'Facturando…' : 'Reintentar factura'}</button>
                </div>
              )}
              {canAnnul && !annul && (
                <button type="button" className="btn btn-danger" disabled={busy || confirming} onClick={() => setAnnul({ reason: '' })}>
                  {status === 'confirmado' ? 'Anular venta' : 'Anular pedido'}
                </button>
              )}
              {canAnnul && annul && (
                <div className={styles.annulBox}>
                  <label className="field">
                    <span className="field-label">Motivo de la anulación</span>
                    <input className="input" autoFocus value={annul.reason} onChange={(e) => setAnnul({ reason: e.target.value })} />
                  </label>
                  <p className={styles.muted}>Se rechaza si la venta tiene factura o algo ya entregado.</p>
                  <div className={styles.rowActions}>
                    <button type="button" className="btn btn-secondary" onClick={() => setAnnul(null)}>Volver</button>
                    <button type="button" className="btn btn-danger" disabled={busy} onClick={doAnnul}>{busy ? 'Anulando…' : 'Confirmar anulación'}</button>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        <PaymentBox
          order={order}
          preview={preview}
          config={config}
          locale={locale}
          busy={busy}
          editable={editable}
          canConfirm={draftStatus}
          blockers={blockers}
          confirming={confirming}
          confirmError={confirmError}
          onPatch={patch}
          onConfirm={confirm}
          onGoCash={onGoCash}
        />
      </div>

      {dialog && (
        <LineDialog
          key={dialog.product?.productId ?? dialog.line.lineId}
          product={dialog.product}
          line={dialog.line}
          locales={locales}
          ownLocalId={user?.localId}
          onConfirm={(v) => (dialog.product ? addLine(dialog.product, v) : editLine(dialog.line, v))}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
