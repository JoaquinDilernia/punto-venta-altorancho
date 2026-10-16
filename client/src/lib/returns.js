// Cambios y devoluciones en el front: etiquetas y cuentas de pantalla. El
// backend recalcula todo al confirmar.
export const SOURCE_LABELS = { app: 'Local', tpv: 'TPV', web: 'Web', manual: 'Sin ticket' };
export const KIND_LABELS = { venta: 'Venta', cambio: 'Cambio', devolucion: 'Devolución' };

export const maxReturnable = (l) => Math.max(0, (l.qtyBought ?? 0) - (l.qtyReturnedBefore ?? 0));
export const returnTotal = (lines) => Math.round((lines ?? []).reduce((s, l) => s + l.qty * l.unitValue, 0) * 100) / 100;

export function defaultDestination(locale) {
  return (locale?.returnDestinations ?? []).find((d) => d.default)?.id ?? locale?.returnDestinations?.[0]?.id ?? '';
}

export function returnBody(purchase, purchaseLine, values) {
  return {
    purchase: { source: purchaseLine.source, purchaseId: purchaseLine.purchaseId, purchaseLineId: purchaseLine.purchaseLineId, productId: purchaseLine.productId },
    returnLine: { qty: values.qty, destinationId: values.destinationId, reason: values.reason, reasonNote: values.reasonNote ?? '' },
  };
}

// Neto aproximado para el vendedor (sin descuentos por medio de pago).
export function roughNet(newLines, returnLines) {
  const goods = (newLines ?? []).filter((l) => l.status !== 'eliminado').reduce((s, l) => s + l.qty * l.basePrice, 0);
  return Math.round((goods - returnTotal(returnLines)) * 100) / 100;
}

export function shortDate(value) {
  const d = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export const digitsOf = (s) => String(s ?? '').replace(/\D/g, '');

// Documentos de los clientes de las compras que vuelven (la NC y el saldo son suyos).
export const holderDocsOf = (returnLines) => [...new Set((returnLines ?? []).map((l) => digitsOf(l.partnerVat)).filter(Boolean))];

// ¿El cliente cargado es otro que el de alguna compra que vuelve?
export function holderDiffers(returnLines, docNumber) {
  const doc = digitsOf(docNumber);
  return doc.length > 0 && (returnLines ?? []).some((l) => digitsOf(l.partnerVat) && digitsOf(l.partnerVat) !== doc);
}

// "Titular: …" en las notas (lo deja el vendedor) -> motivo del cambio de titular.
export const HOLDER_PREFIX = 'Titular: ';
export function holderReasonFromNotes(notes) {
  const line = String(notes ?? '').split('\n').find((l) => l.startsWith(HOLDER_PREFIX));
  return line ? line.slice(HOLDER_PREFIX.length).trim() : '';
}
