// Listas de precios del pedido. Mismas reglas que el backend (posPricing):
// Decoradora y Directorio son solo para clientes con su etiqueta en Odoo;
// Directorio va al costo, no se cobra en el momento ni se factura.
export const PRICE_LISTS = [
  { id: 'normal', label: 'Normal' },
  { id: 'decoradora', label: 'Decoradora' },
  { id: 'directorio', label: 'Directorio' },
];

export const PRICE_LIST_LABELS = Object.fromEntries(PRICE_LISTS.map((l) => [l.id, l.label]));

export const priceListOf = (order) => order?.priceList ?? 'normal';

export function priceListHint(priceList, settings) {
  if (priceList === 'decoradora') return `${String(settings?.decoradoraDiscountPct ?? 5).replace('.', ',')} % menos sobre el precio de siempre, más el descuento del medio de pago. Solo clientes con la etiqueta Decorador/Arquitecto.`;
  if (priceList === 'directorio') return 'Al costo + IVA. No se cobra en el momento y no se factura. Solo clientes con la etiqueta Directorio.';
  return '';
}

// Mismo mensaje que el backend (priceListTagError).
export function priceListTagError(priceList, customer, settings) {
  const tagIds = (customer?.tagIds ?? []).map(Number);
  if (priceList === 'decoradora' && !tagIds.includes(Number(settings?.decoradorTagId))) {
    return 'La lista Decoradora es solo para clientes con la etiqueta Decorador/Arquitecto en Odoo';
  }
  if (priceList === 'directorio' && !tagIds.includes(Number(settings?.directorioTagId))) {
    return 'La lista Directorio es solo para clientes con la etiqueta Directorio en Odoo';
  }
  return null;
}
