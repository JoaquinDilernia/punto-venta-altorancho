# Spikes de Odoo para la Fase 2 — cambios y devoluciones (2026-10-16)

Etapa 1: **solo lectura** (search_read / read / read_group / search_count /
fields_get) sobre el Odoo 16 **real** (no hay entorno de prueba). Cliente con
un wrapper que rechaza cualquier método de escritura.

## Diarios: todos electrónicos

| id | Diario | Sistema |
|---|---|---|
| 32 | Pto. 4 Facturas Las Lomas | RAW_MAW (factura electrónica WS) |
| 65 | Pto. 11 Facturas Belgrano | RAW_MAW |
| 78 | Pto. 12 Alcorta | RAW_MAW |
| 38 | Pto.9 Facturas Web | RAW_MAW |
| 10 / 37 / 62 | Mayorista / Tigre / Facturas E | RAW_MAW / RAW_MAW / FEEWS |
| 28 | Ventas Internas | sin documentos (`l10n_latam_use_documents = false`) |

Conclusión: publicar una nota de crédito en cualquier diario de local la
informa a ARCA. "Ventas Internas" no emite comprobantes pero no sirve para
probar el circuito real. **Las notas de crédito del spike van solo en
borrador**; la aplicación NC → factura se prueba en la punta a punta cuando
se habilite la facturación.

## Tickets del POS de Odoo (`pos.order`)

- **Siguen en uso:** último ticket `Alcorta/2301` del 2026-10-15 23:59.
- 2026: 13.084 `invoiced` + 8.216 `done`. Desde 2026-09: 3.327 facturados,
  794 `done` (incluye reembolsos y tickets en $0).
- Ticket: `name` `Alcorta/2301`, `pos_reference` `Pedido 04468-001-0023`,
  `account_move` = factura (`FA-B 00012-00001533`, diario del local),
  `picking_ids` = un remito `AL/POS/02628` (`AL/Stock` → Clientes, `done`).
- Línea: `price_unit` sin IVA, `discount`, `price_subtotal_incl` (pagado con
  IVA), `pack_lot_ids` (lotes), **`refunded_qty`** (lo ya reembolsado por el
  POS) y `refund_orderline_ids`.
- pos.config → diario: LL 2 → 32, BL 5 → 65, AL 7 → 78 (Nordelta 3 → 37).

### Cómo se devuelve hoy en el POS nativo

~584 reembolsos desde 2026-08 (~8 por día entre los locales).

- Reembolso = `pos.order` con monto negativo (`…/23857REEMBOLSO`), líneas en
  negativo con `refunded_orderline_id` a la línea original; remito
  Clientes → stock del local que lo recibe (**se devuelve en otro local**:
  ticket de LL devuelto en `BL/Stock`).
- Con factura: NC `NC-B` con `reversed_entry_id` a la factura original. **La
  NC sale del diario del local que devuelve** aunque la factura sea de otro
  (NC-B 00004 de Las Lomas revierte FA-B 00012 de Alcorta). Confirma §5.5.
- **Hay reembolsos sin NC aunque la factura original exista** (48855 revierte
  un ticket con `FA-B 00004-00021013` y no tiene `account_move`). Hueco
  fiscal que la app cierra.
- Sin ticket: líneas negativas sin `refunded_orderline_id` (`Belgrano/14790`,
  6 platos con 20 % de descuento).
- **Saldo a favor hoy = medio de pago POS "Cuenta de cliente"** (id 3, sin
  diario): el reembolso se "paga" en negativo a la cuenta del cliente y se
  consume con pagos positivos. Desde 2026-08: 63 altas y 65 usos.
- Cambio por igual valor: ticket en $0.

## Tiendanube en Odoo

- `sale.order` con `team_id` 1 "Tienda Nube", almacén EC (24); ~3.600 en 2
  meses. `name` = `TN<id de orden>` (p. ej. `TN2095995525`); campos
  `tiendanube_order_number`, `clean_tiendanube_order_number`,
  `tiendanube_order_id`, estados de pago y envío.
- Remitos `EC/PICK` (EC/Stock → EC/Salida) y `EC/OUT` (→ Clientes).
- Factura en "Pto.9 Facturas Web" (38). Hay pedidos aún `to invoice`.
- NC web hoy: reversión de la factura (`ref` "Reversión de: FA-…"); sus líneas
  conservan `sale_line_ids`, incluida la línea de envío.

## Devoluciones de remito (`stock.return.picking`)

- En uso para EC, Mayorista, Rolón: moves con `origin_returned_move_id`,
  `to_refund = true`, `sale_line_id`.
- **Con `invoice_policy = order` (99,9 % de los productos, spike S2 de la
  Fase 1) la devolución no genera cantidad a facturar negativa:** el
  `sale.order` no produce la NC solo. Ej. S09383: tras la devolución,
  `qty_to_invoice` sigue en lo pedido. → **La NC se hace siempre como
  reversión parcial de la factura**, también para pedidos de la app.

## Ubicaciones y lotes

- No hay ubicaciones de falla por local. Existen `RMA/Fall` (392) y
  `FER/Stock/Fallados` (429). Los destinos son configurables; hay que crear o
  elegir las ubicaciones con el dueño.
- 1.828 plantillas vendibles con seguimiento por lote/serie.

## Tope (lo ya devuelto)

| Origen | Cómo leerlo |
|---|---|
| TPV | `pos.order.line.refunded_qty` (reembolsos del POS nativo) **+** devoluciones hechas por la app sobre ese remito (moves con `origin_returned_move_id` a los moves del remito del ticket) |
| App / web | Moves `done` con `origin_returned_move_id` a los moves del OUT del pedido |

## Pendiente para la etapa 2 (escrituras, con autorización)

1. `stock.return.picking` sobre el remito de un ticket TPV y de un OUT de
   pedido, con ubicación de destino elegida, y su reversión.
2. Ingreso suelto con lote (sin ticket) y transferencia interna pendiente.
3. Reversión parcial de factura (`account.move.reversal` con líneas y
   cantidades editadas antes de publicar) **en borrador**: tipo de documento
   NC-A/NC-B, diario del local, `reversed_entry_id`; luego borrar el borrador.
4. NC sin comprobante asociado en borrador: qué pide `l10n_ar` (período).
