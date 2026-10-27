export const DELIVERY_LABELS = {
  ahora: 'Se lo lleva ahora', retira_local: 'Retira otro día en el local', envio: 'Envío a domicilio',
  retira_rolon: 'Retira en Rolón', retira_otro_local: 'Retira en otro local',
};
export const ORIGIN_LABELS = { stock: 'Stock del local', exhibicion: 'Exhibición', rolon: 'Rolón', web: 'Web' };
export const ORDER_STATUS = {
  carrito: { label: 'Carrito', tone: 'neutral' }, pendiente: { label: 'En caja', tone: 'pending' },
  error: { label: 'Con error', tone: 'removed' }, confirmado: { label: 'Confirmado', tone: 'done' },
  anulado: { label: 'Anulado', tone: 'removed' }, descartado: { label: 'Descartado', tone: 'neutral' },
};
export const AFIP_LABELS = {
  responsable_inscripto: 'Responsable inscripto (Factura A)', monotributo: 'Monotributo (Factura A)',
  exento: 'Exento (Factura B)', consumidor_final: 'Consumidor final (Factura B)',
};

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 });
export const formatMoney = (n) => money.format(n ?? 0);

// Precio con el descuento de un medio de pago (informativo para el vendedor).
export const priceWith = (price, pct) => Math.round(price * (1 - pct / 100) * 100) / 100;

export const currentMonth = () => {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
