import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { formatMoney } from '../../lib/labels.js';
import { formatDateTime } from '../../lib/format.js';
import { Notice, OrderStatusChip } from '../../components/ui.jsx';
import ProductSearch from '../../components/ProductSearch.jsx';
import CustomerForm, { EMPTY_CUSTOMER, customerErrors } from '../../components/CustomerForm.jsx';
import ShippingFields, { EMPTY_SHIPPING, shippingErrors, shippingBody } from '../../components/ShippingFields.jsx';
import ReturnLines from '../../components/ReturnLines.jsx';
import CreditBadge from '../../components/CreditBadge.jsx';
import { KIND_LABELS, holderDiffers, holderReasonFromNotes } from '../../lib/returns.js';
import PaymentBox from './PaymentBox.jsx';
import RefundBox, { refundCovers } from './RefundBox.jsx';
import { KindTag, LineDialog, LineRow, activeLinesOf, lineBody } from './lineParts.jsx';
import { moneyText, parseMoney } from './money.js';
import { exchangeTicketHtml, getAutoPrint, printHtml, printSaleDocs, saleReceiptHtml, setAutoPrint } from '../../lib/printing.js';
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
  ...Object.fromEntries(Object.entries(s ?? {}).filter(([k]) => k !== 'amount' && k !== 'homeServiceAmount').map(([k, v]) => [k, v ?? ''])),
  amount: moneyText(s?.amount),
  homeService: s?.homeServiceAmount != null,
  homeAmount: moneyText(s?.homeServiceAmount),
});
const SHIP_KEYS = ['street', 'number', 'floor', 'city', 'zip', 'phone', 'notes'];
const normShipping = (s, amount, home) => JSON.stringify([...SHIP_KEYS.map((k) => String(s?.[k] ?? '').trim()), amount, home]);

// Funciona con el objeto de campos o con una función (último valor) -> campos.
const draftUpdater = (setter) => (change) => setter((prev) => ({ ...prev, ...(typeof change === 'function' ? change(prev) : change) }));

const STATE_LABELS = { done: 'validado', cancel: 'cancelado', draft: 'borrador', posted: 'publicada', assigned: 'listo', confirmed: 'en espera', waiting: 'en espera' };
const CONFIRMED_LABEL = { cambio: 'Cambio confirmado', devolucion: 'Devolución confirmada' };

// Comprobante de un cambio o devolución confirmado: qué volvió (y adónde), qué
// se llevó, cómo se devolvió la plata y los documentos de Odoo.
function ExchangeReceipt({ order, locale, methodById }) {
  const steps = order.returnSteps ?? {};
  const pickings = Object.values(steps.pickings ?? {});
  const transfers = Object.values(steps.transfers ?? {});
  const creditNotes = Object.values(steps.creditNotes ?? {});
  const lines = activeLinesOf(order);
  const refund = order.refund;
  const state = (s) => (s ? ` (${STATE_LABELS[s] ?? s})` : '');
  return (
    <section className={styles.receipt} aria-label="Comprobante">
      <div>
        <p className={styles.resultKicker}>{CONFIRMED_LABEL[order.kind] ?? 'Operación confirmada'}</p>
        <p className={`${styles.resultOdoo} num`}>{order.number} · {KIND_LABELS[order.kind] ?? order.kind}</p>
      </div>

      <div className={styles.receiptBlock}>
        <h3>Volvió</h3>
        <ReturnLines lines={order.returnLines} destinations={locale?.returnDestinations ?? []} readOnly />
      </div>

      {lines.length > 0 && (
        <div className={styles.receiptBlock}>
          <h3>Se llevó</h3>
          <ul>
            {lines.map((l) => (
              <li key={l.lineId} className={styles.receiptRow}><span>{l.qty} × {l.name}</span><span className="num">{formatMoney(l.qty * l.basePrice)}</span></li>
            ))}
          </ul>
          <p>Venta en Odoo: <strong className="num">{order.odooOrderName || '—'}</strong>{order.invoiceName ? <> · Factura <strong>{order.invoiceName}</strong></> : order.wantsInvoice ? ' · Factura todavía sin emitir' : ' · Sin factura'}</p>
        </div>
      )}

      <div className={styles.receiptBlock}>
        <h3>Plata</h3>
        {(order.payments ?? []).map((p) => (
          <p key={`p:${p.methodId}:${p.detailId ?? ''}`} className={styles.receiptRow}>
            <span>Cobrado · {methodById.get(p.methodId)?.label ?? p.methodId}</span>
            <span className="num">{p.amount != null ? formatMoney(p.amount) : formatMoney(order.totals?.collect ?? order.totals?.total)}</span>
          </p>
        ))}
        {(refund?.cashBack ?? []).map((c) => (
          <p key={`r:${c.methodId}`} className={styles.receiptRow}><span>Reintegro · {methodById.get(c.methodId)?.label ?? c.methodId}</span><span className="num">{formatMoney(c.amount)}</span></p>
        ))}
        {refund?.credit > 0 && <p className={styles.receiptRow}><span>Saldo a favor generado</span><span className="num">{formatMoney(refund.credit)}</span></p>}
        {!(order.payments ?? []).length && !(refund?.cashBack ?? []).length && !(refund?.credit > 0) && <p>Sin movimiento de plata</p>}
        {order.customer?.docNumber && (
          <p>Saldo del cliente ahora: <CreditBadge doc={order.customer.docNumber} emptyText="Sin saldo a favor" /></p>
        )}
      </div>

      <div className={styles.receiptBlock}>
        <h3>Documentos en Odoo</h3>
        <ul>
          {pickings.map((p) => <li key={`pk:${p.id}`}>Remito <strong className="num">{p.name ?? p.id}</strong>{state(p.state)}</li>)}
          {transfers.map((t) => (
            <li key={`tr:${t.id}`}>
              Traslado <strong className="num">{t.name ?? t.id}</strong>
              {t.state !== 'done' ? <span className={styles.pendingTag}> — Pendiente de retirar por logística</span> : state(t.state)}
            </li>
          ))}
          {creditNotes.map((n) => <li key={`nc:${n.id}`}>Nota de crédito <strong className="num">{n.name ?? n.id}</strong>{state(n.state)}</li>)}
          {pickings.length + transfers.length + creditNotes.length === 0 && <li>Sin documentos de devolución</li>}
        </ul>
        {steps.creditNotesSkipped && <p className={styles.resultWarning} role="status">Nota de crédito pendiente: la facturación de este local está apagada</p>}
      </div>

      {order.invoiceError && <p className={styles.resultError}>No se pudo facturar: {order.invoiceError}</p>}
      {order.warning && <p className={styles.resultWarning} role="alert">{order.warning}</p>}
    </section>
  );
}

// Pedido de caja: líneas, cliente, envío y cobro. Sirve para la cola y para el
// historial. Los totales los calcula siempre el servidor (`preview`).
export default function OrderDetail({ orderId, localId, config, backLabel, onBack, onGoCash, onChanged }) {
  const [data, setData] = useState(null); // { order, preview }
  const [loadError, setLoadError] = useState('');
  const [customer, setCustomer] = useState(null);
  const [shipping, setShipping] = useState(null);
  const [notes, setNotes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState({ kind: 'error', text: '' });
  const [payError, setPayError] = useState(''); // errores de cobro: se ven dentro de PaymentBox
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState(null);
  const [dialog, setDialog] = useState(null); // { product } | { line }
  const [annul, setAnnul] = useState(null); // null | { reason }
  const [holderReason, setHolderReason] = useState(null);
  const [refundPending, setRefundPending] = useState(false);
  const [autoPrint, setAutoPrintState] = useState(getAutoPrint);
  const seq = useRef(0);
  const autoInvoice = useRef(false);

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
      setHolderReason((prev) => prev ?? (res.order.holderChangeReason || holderReasonFromNotes(res.order.notes)));
      return res;
    } catch (err) {
      if (id === seq.current) setLoadError(err.message);
      return null;
    }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  // Ejecuta un cambio y vuelve a pedir el pedido (y su preview). Devuelve la
  // respuesta del GET, o null si el cambio falló.
  async function mutate(fn, toPay = false) {
    setBusy(true);
    setNotice({ kind: 'error', text: '' });
    if (toPay) setPayError('');
    try {
      await fn();
      return await load();
    } catch (err) {
      if (toPay) setPayError(err.message);
      else setNotice({ kind: 'error', text: err.message });
      await load();
      return null;
    } finally {
      setBusy(false);
    }
  }
  const patch = (body) => mutate(() => api(`/orders/${orderId}`, { method: 'PATCH', body }));
  const patchPayment = (body) => mutate(() => api(`/orders/${orderId}`, { method: 'PATCH', body }), true);

  const order = data?.order ?? null;
  const preview = data?.preview ?? null;

  const lines = useMemo(() => activeLinesOf(order), [order]);
  const status = order?.status;
  const inOdoo = order ? hasOdoo(order) : false;
  const draftStatus = status === 'pendiente' || status === 'error';
  const editable = draftStatus && !inOdoo;
  const locale = locales.find((l) => l.id === order?.localId);
  const needsShipping = lines.some((l) => l.delivery === 'envio');
  const returnLines = order?.returnLines ?? [];
  const exchange = returnLines.length > 0;
  // Con el plan de devolución guardado lo que vuelve ya no se toca (backend).
  const returnsEditable = editable && !order?.returnSteps?.plan;
  const net = preview?.totals?.net ?? null;
  // La compra que vuelve tenía factura y hay algo nuevo: la NC se aplica a la factura nueva.
  const invoiceHint = exchange && lines.length > 0 && returnLines.some((l) => l.invoiceId);
  const methodById = useMemo(() => new Map([
    ...(config.paymentMethods ?? []).map((m) => [m.id, m]),
    ...(config.creditMethod ? [[config.creditMethod.id, config.creditMethod]] : []),
  ]), [config]);
  const printCtx = {
    localName: locale?.name ?? order?.localId ?? '',
    methodLabel: (p) => {
      const m = methodById.get(p.methodId);
      const detail = m?.details?.find((d) => d.id === p.detailId)?.label;
      return [m?.label ?? p.methodId, detail].filter(Boolean).join(' · ');
    },
  };
  const toggleAutoPrint = (on) => { setAutoPrint(on); setAutoPrintState(on); };
  const refundMethods = useMemo(
    () => (config.paymentMethods ?? []).filter((m) => m.active !== false && m.id !== (config.creditMethod?.id ?? 'saldo')),
    [config],
  );

  // Con factura en la compra original y algo nuevo, "¿Quiere factura?" arranca
  // marcado (una vez, al abrir: después se puede desmarcar).
  useEffect(() => {
    if (!order || autoInvoice.current) return;
    autoInvoice.current = true;
    if (editable && invoiceHint && locale?.invoices !== false && !order.wantsInvoice) patch({ wantsInvoice: true });
  });

  const editReturn = (rl, changes) => mutate(() => api(`/orders/${orderId}/return-lines/${rl.rlId}`, { method: 'PATCH', body: changes }));
  const removeReturn = (rl) => mutate(() => api(`/orders/${orderId}/return-lines/${rl.rlId}`, { method: 'DELETE' }));
  const saveHolderReason = () => patch({ holderChangeReason: (holderReason ?? '').trim() });
  const saveRefund = (refund) => patchPayment({ refund });

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
    await patch({ shipping: shippingBody(shipping) });
  }
  const saveNotes = () => patch({ notes });

  async function confirm() {
    setConfirming(true);
    setConfirmError(null);
    setNotice({ kind: 'error', text: '' });
    try {
      await api(`/orders/${orderId}/confirm`, { method: 'POST' });
      const res = await load();
      onChanged?.();
      if (autoPrint && res?.order?.status === 'confirmado') printSaleDocs(res.order, printCtx).catch(() => {});
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
  const homeParsed = parseMoney(shipping.homeAmount);
  const shippingDirty = editable && needsShipping
    && normShipping(shipping, shippingParsed.ok ? shippingParsed.value : null, shipping.homeService ? (homeParsed.ok ? homeParsed.value : null) : null)
      !== normShipping(order.shipping, order.shipping?.amount ?? null, order.shipping?.homeServiceAmount ?? null);
  const blockers = [];
  if (customerDirty) blockers.push('Guardá los cambios del cliente');
  if (editable && needsShipping && (shippingDirty || !order.shipping)) blockers.push('Guardá los datos del envío');
  if (editable && !order.customer) blockers.push('Falta cargar el cliente');
  // Cambio de titular: lo que manda es el cliente guardado (lo valida el backend al confirmar).
  const holderNeeded = exchange && holderDiffers(returnLines, order.customer?.docNumber);
  const holderShown = exchange && (holderNeeded || holderDiffers(returnLines, customer.docNumber));
  const holderDirty = (holderReason ?? '').trim() !== (order.holderChangeReason ?? '');
  if (editable && holderNeeded) {
    if (!(holderReason ?? '').trim()) blockers.push('Escribí el motivo del cambio de titular');
    else if (holderDirty || !order.holderChangeReason) blockers.push('Guardá el motivo del cambio de titular');
  }
  if (editable && net != null && net < 0) {
    if (refundPending) blockers.push('Guardá el reintegro (o volvé a todo saldo a favor)');
    else if (!refundCovers(order.refund, -net)) blockers.push('Elegí cómo se devuelve: reintegro o saldo a favor');
  }
  const notesDirty = notes !== (order.notes ?? '');
  // Un cambio o devolución confirmado no se anula (el servidor lo rechaza).
  const canAnnul = (status === 'confirmado' && !exchange) || (['pendiente', 'error'].includes(status) && !inOdoo);
  const canRetryInvoice = status === 'confirmado' && order.wantsInvoice && !order.invoiceName && Boolean(order.invoiceError) && locale?.invoices !== false;

  return (
    <div className={styles.detail}>
      <header className={styles.detailHead}>
        <button type="button" className="btn btn-ghost" onClick={onBack}>← {backLabel}</button>
        <h1 className={styles.viewTitle}>{exchange ? KIND_LABELS[order.kind] ?? 'Operación' : 'Pedido'} {order.number}</h1>
        <KindTag kind={order.kind} />
        <OrderStatusChip status={status} large />
        <span className={styles.muted}>
          {order.sellerName} · enviado {formatDateTime(order.sentAt ?? order.createdAt)}
        </span>
      </header>

      <Notice kind={notice.kind} onClose={notice.text ? () => setNotice({ kind: 'error', text: '' }) : undefined}>{notice.text}</Notice>
      <Notice kind="error">{loadError}</Notice>

      {status === 'confirmado' && exchange && <ExchangeReceipt order={order} locale={locale} methodById={methodById} />}
      {status === 'confirmado' && lines.length > 0 && (
        <div className={styles.printBar}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => printHtml(saleReceiptHtml(order, printCtx))}>Imprimir recibo</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => printHtml(exchangeTicketHtml(order))}>Imprimir ticket de cambio</button>
          <label className={styles.printAuto}>
            <input type="checkbox" checked={autoPrint} onChange={(e) => toggleAutoPrint(e.target.checked)} />
            Imprimir solo al confirmar (en esta PC)
          </label>
        </div>
      )}
      {status === 'confirmado' && !exchange && (
        <section className={styles.result} aria-label="Resultado de la venta">
          <p className={styles.resultKicker}>Venta confirmada en Odoo</p>
          <p className={`${styles.resultOdoo} num`}>{order.odooOrderName || '—'}</p>
          <p className={styles.resultLine}>
            {order.invoiceName
              ? <>Factura <strong>{order.invoiceName}</strong></>
              : order.wantsInvoice ? 'Con factura: todavía sin emitir' : 'Sin factura'}
          </p>
          {order.webTransfer && <p className={styles.resultLine}>Traslado web → Rolón <strong className="num">{order.webTransfer.name}</strong></p>}
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
          {exchange && status !== 'confirmado' && (
            <section className={styles.card} aria-label="Vuelve">
              <h2 className={styles.cardTitle}>Vuelve</h2>
              <ReturnLines
                lines={returnLines}
                destinations={locale?.returnDestinations ?? []}
                busy={busy || confirming}
                readOnly={!returnsEditable}
                onEdit={editReturn}
                onRemove={removeReturn}
              />
              {editable && !returnsEditable && <p className={styles.hint}>La devolución ya empezó a cargarse en Odoo: lo que vuelve no se puede cambiar.</p>}
            </section>
          )}
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>{exchange ? 'Se lleva' : 'Productos'}</h2>
            {exchange && lines.length === 0 && <p className={styles.hint}>No se lleva nada nuevo.</p>}
            <ul className={styles.lines}>
              {lines.map((l) => (
                <LineRow
                  key={l.lineId}
                  line={l}
                  localName={localName}
                  busy={busy || confirming}
                  readOnly={!editable}
                  onlyLine={lines.length <= 1 && !exchange}
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
                  localId={order.localId}
                  onPick={(product) => setDialog({ product })}
                />
              </details>
            )}
          </section>

          {editable && needsShipping && (
            <div className={styles.saveBlock}>
              <ShippingFields value={shipping} onChange={draftUpdater(setShipping)} defaultHomeAmount={config?.settings?.homeServiceDefaultAmount} />
              <button type="button" className="btn btn-secondary" disabled={busy || confirming || !shippingDirty} onClick={saveShipping}>Guardar envío</button>
            </div>
          )}
          {!editable && order.shipping && (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Envío a domicilio</h2>
              <p>{order.shipping.street} {order.shipping.number}{order.shipping.floor ? `, ${order.shipping.floor}` : ''} · {order.shipping.city} ({order.shipping.zip}) · Tel. {order.shipping.phone}</p>
              {order.shipping.notes && <p className={styles.muted}>{order.shipping.notes}</p>}
              <p className={styles.muted}>Costo: {formatMoney(order.shipping.amount)}</p>
              {order.shipping.homeServiceAmount != null && <p className={styles.muted}>Subida al domicilio: {formatMoney(order.shipping.homeServiceAmount)}</p>}
            </section>
          )}

          {editable ? (
            <div className={styles.saveBlock}>
              <CustomerForm value={customer} onChange={draftUpdater(setCustomer)} decoradorTagId={config.settings?.decoradorTagId} showCredit />
              <button type="button" className="btn btn-secondary" disabled={busy || confirming || !customerDirty} onClick={saveCustomer}>Guardar cliente</button>
            </div>
          ) : order.customer && (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Cliente</h2>
              <p><strong>{order.customer.name}</strong> · DNI/CUIT {order.customer.docNumber}</p>
              <p className={styles.muted}>{[order.customer.phone, order.customer.email, order.customer.street, order.customer.city].filter(Boolean).join(' · ')}</p>
            </section>
          )}

          {editable && holderShown && (
            <section className={styles.card} aria-label="Cambio de titular">
              <h2 className={styles.cardTitle}>Cambio de titular</h2>
              <p className={styles.hint}>La compra que vuelve está a nombre de otro documento: la nota de crédito y el saldo quedan a nombre del cliente de este pedido.</p>
              <label className="field">
                <span className="field-label">Motivo del cambio de titular (obligatorio)</span>
                <input className="input" maxLength={200} value={holderReason ?? ''} onChange={(e) => setHolderReason(e.target.value)} />
              </label>
              {!holderNeeded && <p className={styles.hint}>Se pide porque el documento del cliente sin guardar es otro.</p>}
              <div className={styles.rowActions}>
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy || confirming || !holderDirty || !(holderReason ?? '').trim()} onClick={saveHolderReason}>Guardar motivo</button>
              </div>
            </section>
          )}
          {!editable && exchange && order.holderChangeReason && (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Cambio de titular</h2>
              <p>{order.holderChangeReason}</p>
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
          payError={payError}
          onPatch={patchPayment}
          onConfirm={confirm}
          onGoCash={onGoCash}
          invoiceHint={invoiceHint}
        >
          {editable && net != null && net < 0 && (
            <RefundBox
              key={`${orderId}:${-net}`}
              amount={-net}
              methods={refundMethods}
              value={order.refund}
              disabled={busy || confirming}
              onSave={saveRefund}
              onDirtyChange={setRefundPending}
            />
          )}
        </PaymentBox>
      </div>

      {dialog && (
        <LineDialog
          key={dialog.product?.productId ?? dialog.line.lineId}
          product={dialog.product}
          line={dialog.line}
          locales={locales}
          ownLocalId={order.localId ?? localId}
          onConfirm={(v) => (dialog.product ? addLine(dialog.product, v) : editLine(dialog.line, v))}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
