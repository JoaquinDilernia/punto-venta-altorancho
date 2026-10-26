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

## Otros hallazgos

- Hay un módulo de **RMA** instalado: el asistente `stock.return.picking`
  tiene `create_rma` / `rma_operation_id`, y existen "Recepciones de RMA"
  (tipo 324, destino `RMA/LL` 385). No se usa en el diseño; se evita marcar
  `create_rma`.
- Tipos de remito TPV: LL (7) devuelve con "LL: Devoluciones" (6). BL y AL
  **tienen su tipo "Devoluciones" (BL 308, AL 352)**, pero el remito TPV no lo
  tiene configurado como tipo de devolución → el asistente usa el mismo tipo.
  No bloquea: la app fija `returnPickingTypeId` por local (Task 1).

## Etapa 2 — escrituras (autorizada por el dueño 2026-10-16)

### Notas de crédito en borrador (hecho, borradas)

- **Reversión parcial:** `account.move.reversal` con `refund_method:
  'refund'`, `journal_id: 32` (Las Lomas) sobre `FA-B 00012-00001533`
  (Alcorta). Resultado: NC borrador id 368705, `name '/'`, tipo **(8) NOTAS
  DE CREDITO B** (disponibles 8 y 114), `reversed_entry_id` a la factura,
  `ref` "Reversión de: FA-B 00012-00001533, <motivo>". El asistente acepta
  cualquier diario de venta (`available_journal_ids`). Editando la cantidad
  de la línea en borrador el total bajó proporcional (52.990 → 26.495,01):
  **la NC parcial se arma revirtiendo y editando líneas antes de publicar.**
  Borrada (`unlink`) sin consumir número.
- Las líneas de la NC de un ticket TPV no traen `sale_line_ids` (sí en web).
- **NC sin comprobante asociado:** `account.move` `out_refund` en diario 32,
  partner PRUEBA POS: tipo (8) NC-B asignado solo, `reversed_entry_id`
  vacío. No hay campo de período asociado en el modelo; lo que `l10n_ar_edi`
  envíe a ARCA al publicar solo se puede ver publicando → **queda para la
  punta a punta con facturación habilitada.** Borrada.

### Stock (corrido por el dueño desde la sesión)

**A. Devolución de remito — OK.** `stock.return.picking` sobre
`LL/OUT/00260` (S10863, BCC104TR):

- En v16 `default_get` no trae líneas ni ubicación (salen de un onchange):
  se arman a mano desde los moves `done` del remito (`product_id`,
  `move_id`, `uom_id`, `quantity`, `to_refund`) y `location_id` explícito.
- Resultado: `LL/RET/02566`, tipo "LL: Devoluciones" (6), Clientes →
  **`LL/Exhibicion` (destino elegido, distinto del original)**, `sale_id`
  S10863, move con `origin_returned_move_id` 612602, `to_refund`,
  `sale_line_id`; `qty_delivered` de la línea bajó a 0. Quant
  `LL/Exhibicion` +1.
- Revertida con la devolución de la devolución (`LL/RET/02567`,
  Exhibición → Clientes). Stock final igual al inicial (LL/Stock 18,
  Exhibición 0).

**B y C. Remitos creados a mano — estaban BLOQUEADOS por permisos; re-corridos OK el 2026-10-16.**

Primer intento: `stock.picking.action_confirm` sobre un remito creado por API
(ingreso suelto tipo 6, y transferencia interna tipo 5 LL → RL) falló: *"No
puedes ingresar a los registros 'RMA' (rma)"* — el módulo RMA engancha la
confirmación y el usuario de la API (uid 2798) no tenía grupo RMA. Las
devoluciones por asistente (A) no pasan por ahí. Los dos remitos de prueba
quedaron en borrador y se **borraron**; no se movió stock.

**Re-corrida 2026-10-16:** el dueño dio al usuario uid 2798 el grupo RMA y se
repitieron las pruebas:

- **B. Devolución manual sin ticket, con lote — OK.** `LL/RET/02570` (Clientes
  → `LL/Stock`, lote 17050): stock 5 → 6, validada. Revertida con
  `LL/RET/02571` (stock vuelve a 5).
- **C. Transferencia interna — OK.** `LL/INT/02335` `LL/Stock` → `RL/Stock`:
  confirmada y reservada (estado `assigned`), luego cancelada.

Con el grupo RMA ya no hay bloqueo para ingreso sin ticket ni para el traslado
a Rolón.

## Pendiente para la etapa 2 (escrituras, con autorización)

1. `stock.return.picking` sobre el remito de un ticket TPV y de un OUT de
   pedido, con ubicación de destino elegida, y su reversión.
2. Ingreso suelto con lote (sin ticket) y transferencia interna pendiente.
3. Reversión parcial de factura (`account.move.reversal` con líneas y
   cantidades editadas antes de publicar) **en borrador**: tipo de documento
   NC-A/NC-B, diario del local, `reversed_entry_id`; luego borrar el borrador.
4. NC sin comprobante asociado en borrador: qué pide `l10n_ar` (período).

## Pendientes antes de la punta a punta (Fase 2)

Estado al 2026-10-26.

| # | Qué | Quién | Bloquea |
|---|---|---|---|
| 1 | ~~Grupo "RMA / Usuario" para el usuario de la API (uid 2798)~~ **Resuelto 2026-10-16** | Admin de Odoo | ~~Ingreso sin ticket y traslado a Rolón~~ (ya no bloquea) |
| 2 | ~~Ubicaciones de fallas por local~~ **Resuelto 2026-10-26:** lo que vuelve con falla va a "Enviar a Rolón"; el traslado sale con motivo "Fallas" | Dueño | — |
| 3 | ~~Medio de Odoo para ventas pagadas 100 % con saldo~~ **Resuelto 2026-10-26:** "Efectivo" (cargado en Ajustes) | Dueño | — |
| 4 | ~~Días de validez del saldo a favor~~ **Resuelto 2026-10-26:** no vence (vacío) | Dueño | — |
| 5 | Qué se hace con los saldos de "Cuenta de cliente" del POS nativo | Dueño | Nada (decisión pendiente) |
| 6 | ~~Autorización para facturar (NC reales)~~ **Autorizado 2026-10-26** para la punta a punta | Dueño | — |
