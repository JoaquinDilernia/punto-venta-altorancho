// Comprobantes para la térmica de 58 mm (X-Printer XP-58IIH): recibo de la
// venta y ticket de cambio. Cada uno se arma como HTML en un iframe oculto y
// se imprime con print(); con Chrome abierto con --kiosk-printing sale directo
// a la impresora predeterminada, sin diálogo.
import logoUrl from '../assets/logo-altorancho.png';
import { formatMoney } from './labels.js';
import { toMs } from './format.js';

const TZ = 'America/Argentina/Buenos_Aires';
const stamp = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ,
});
const dateOf = (order) => stamp.format(toMs(order.confirmedAt) ?? Date.now()).replace(',', '');

const FOOTER = '<p class="foot">www.altorancho.com<br>11-3144-0631</p>';
// Unos segundos entre recibo y ticket para cortar el papel.
export const GAP_MS = 4000;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const activeLines = (order) => (order.lines ?? []).filter((l) => l.status !== 'eliminado');

// 58 mm de papel, ~48 mm imprimibles.
function page(title, body) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page { size: 58mm auto; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { width: 48mm; margin: 0 auto; padding: 3mm 0 6mm; font: 11px/1.35 Arial, Helvetica, sans-serif; color: #000; }
.logo { display: block; width: 36mm; margin: 0 auto 2mm; }
.head { text-align: center; font-weight: 700; }
.rule { border: 0; border-top: 1px dashed #000; margin: 2mm 0; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; font-weight: 700; padding-bottom: 1mm; }
td { vertical-align: top; padding: 0.5mm 0; }
td + td, th + th { padding-left: 1.5mm; }
.nw { white-space: nowrap; }
.r { text-align: right; white-space: nowrap; }
.sub { font-size: 10px; }
.total td { font-size: 13px; font-weight: 700; padding-top: 1mm; }
.note { text-align: center; margin: 1.5mm 0; }
.foot { text-align: center; font-weight: 700; }
</style></head><body><img class="logo" src="${esc(new URL(logoUrl, window.location.href).href)}" alt="altorancho.">${body}</body></html>`;
}

// Recibo para el cliente (no fiscal): productos, descuentos, total y pagos.
// ctx: { localName, methodLabel(payment), sellerName? }
export function saleReceiptHtml(order, ctx) {
  const t = order.totals ?? {};
  const exchange = (order.returnLines ?? []).length > 0;
  const rows = activeLines(order).map((l) => `<tr><td>${esc(l.qty)} × ${esc(l.name)}<div class="sub">${esc(l.sku)}</div></td><td class="r">${formatMoney(l.qty * l.basePrice)}</td></tr>`).join('');
  const row = (label, value, cls = '') => `<tr class="${cls}"><td>${label}</td><td class="r">${value}</td></tr>`;
  const sums = [row('Productos', formatMoney(t.products))];
  if (t.paymentDiscount > 0) sums.push(row(`Desc. medio de pago${t.paymentPct ? ` (${t.paymentPct} %)` : ''}`, `− ${formatMoney(t.paymentDiscount)}`));
  if (t.extraDiscount > 0) sums.push(row(`Desc. ${esc(order.extraDiscount?.name ?? 'extra')}`, `− ${formatMoney(t.extraDiscount)}`));
  if (t.shipping > 0) sums.push(row('Envío', `+ ${formatMoney(t.shipping)}`));
  if (t.homeService > 0) sums.push(row('Subida al domicilio', `+ ${formatMoney(t.homeService)}`));
  if (exchange) {
    sums.push(row('Se lleva', formatMoney(t.total)), row('Vuelve', `− ${formatMoney(t.returnValue)}`));
    sums.push(row(t.net < 0 ? 'A favor del cliente' : 'Diferencia', formatMoney(Math.abs(t.net ?? 0)), 'total'));
  } else {
    sums.push(row('TOTAL', formatMoney(t.total), 'total'));
  }
  const collect = t.collect ?? t.total ?? 0;
  const payments = (order.payments ?? []).map((p) => row(esc(ctx.methodLabel(p)), formatMoney(p.amount ?? collect))).join('');
  const customer = order.customer?.name ? `<p>Cliente: ${esc(order.customer.name)}${order.customer.docNumber ? ` (${esc(order.customer.docNumber)})` : ''}</p>` : '';
  return page(`Recibo ${order.number}`, `
<div class="head"><p>${esc(ctx.localName)}</p><p>FECHA: ${dateOf(order)}</p><p>PEDIDO: ${esc(order.number)}</p>
${order.odooOrderName ? `<p>REF. VENTA: ${esc(order.odooOrderName)}</p>` : ''}${order.invoiceName ? `<p>FACTURA: ${esc(order.invoiceName)}</p>` : ''}</div>
<hr class="rule">${customer}${order.sellerName ? `<p>Vendedor: ${esc(order.sellerName)}</p>` : ''}
<hr class="rule"><table>${rows}</table>
<hr class="rule"><table>${sums.join('')}</table>
${payments && collect > 0 ? `<hr class="rule"><table><tr><th colspan="2">Pagos</th></tr>${payments}</table>` : ''}
<hr class="rule"><p class="note">Comprobante no válido como factura</p>
<hr class="rule">${FOOTER}`);
}

// Ticket de cambio: mismo formato que el de Odoo (sin precios).
export function exchangeTicketHtml(order) {
  const rows = activeLines(order).map((l) => `<tr><td class="nw">${esc(l.sku)}</td><td>${esc(l.name)}</td><td class="r">${esc(l.qty)}</td></tr>`).join('');
  return page(`Ticket de cambio ${order.number}`, `
<div class="head"><p>FECHA: ${dateOf(order)}</p>${order.odooOrderName ? `<p>REF. VENTA: ${esc(order.odooOrderName)}</p>` : ''}<p>Pedido ${esc(order.number)}</p></div>
<hr class="rule"><table><tr><th>SKU</th><th>ESTILO</th><th class="r">CANT.</th></tr>${rows}</table>
<hr class="rule"><p class="note">El cambio de los productos puede gestionarse en cualquiera de nuestras sucursales</p>
<p class="note">La validez del cambio es efectiva hasta 30 días después de la fecha de compra</p>
<hr class="rule">${FOOTER}`);
}

// Imprime un documento y resuelve cuando el iframe ya se sacó.
export function printHtml(html) {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
    frame.onload = async () => {
      const images = [...frame.contentDocument.images];
      await Promise.all(images.map((img) => (img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r; }))));
      frame.contentWindow.focus();
      frame.contentWindow.print();
      setTimeout(() => { frame.remove(); resolve(); }, 500);
    };
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Recibo y, unos segundos después, el ticket de cambio. Solo si se lleva algo.
export async function printSaleDocs(order, ctx) {
  if (!activeLines(order).length) return;
  await printHtml(saleReceiptHtml(order, ctx));
  await sleep(GAP_MS);
  await printHtml(exchangeTicketHtml(order));
}

// Preferencia por PC: solo imprime solo en las cajas con la térmica.
const AUTO_KEY = 'pos.autoPrint';
export function getAutoPrint() {
  try { return localStorage.getItem(AUTO_KEY) !== 'off'; } catch { return true; }
}
export function setAutoPrint(on) {
  try { localStorage.setItem(AUTO_KEY, on ? 'on' : 'off'); } catch { /* sin storage: queda prendido */ }
}
