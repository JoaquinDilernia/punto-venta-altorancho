# Spikes de Odoo para el POS de locales (2026-10-13)

S3, S2 y S5 en solo lectura (search_read / read / read_group / search_count). S1 y S1b incluyen escrituras autorizadas por el dueño sobre pedidos de prueba, todas revertidas (cancelación). Odoo 16.

## S3 - Precio full vs promocional

Evidencia:
- Listas 313 y 314 (ARS, `discount_policy: with_discount`): 3084 y 3083 ítems. Todos con `compute_price = fixed`, `base = list_price`, sin fechas, `min_quantity = 0`.
- `applied_on`: 313 -> 3074 `1_product` + 10 `0_product_variant`; 314 -> 3074 `1_product` + 9 `0_product_variant`. **No hay ítems `2_product_category` ni `3_global`. Ninguna lista usa `base = pricelist`.**
- `product.template.list_price` NO sirve como precio: en 3384 plantillas vendibles vale 1 o 1.000.000 (placeholder). Ej.: IME033BL list_price 1.000.000.
- Muestra de 10 SKUs con stock en LL/Stock (precio ítem 314 / ítem 313):
  IME033BL 24785.12 / 29990; BCC140AM 10735.54 / 12990; DCE005BK 4950.41 / 5990; BCC102TR 7429.75 / 8990; BCC142MB 13214.88 / 15990; BCC136VE 4123.97 / 4990; BCC104TR 4123.97 / 4990; BCC135RJ 11561.98 / 13990; IME067CR 38008.26 / 45990; BCV135AZ 12388.43 / 14990.
- Relación 313/314 sobre las 3074 plantillas con ambos ítems: 1.21 en 3071 casos; 1.25 en 2; 1.34 en 1 (ej. tmpl 56059: 33000/26400; 56061: 33000/24600).

Conclusión:
- **El precio full sale del ítem `fixed` de la lista 314, SIN IVA** (el impuesto 62 `IVA 21% Ventas` tiene `price_include: false`).
- **El ítem de la 313 es el mismo precio con IVA incluido** (314 x 1,21), redondeado a precio de vitrina (...90). NO es un descuento: en 3071 de 3074 plantillas es exactamente el precio full + IVA. Solo difiere en 3 plantillas (56059, 56060, 56061).
- Regla propuesta: precio full = `fixed_price` del ítem de la 314 (buscar primero ítem de variante `0_product_variant`, luego ítem `1_product`); precio promocional = `fixed_price` de la 313 / 1,21 (pasarlo a neto antes de cargarlo en la línea, porque el impuesto es no incluido). Verificar con el dueño que ésa es la "promo" deseada, ya que casi siempre coincide con el full.
- Los ids de lista cambian cada mes: van en Ajustes, no hardcodeados. `price_get` no existe en `product.pricelist` en esta versión (usar `_get_product_price` vía sale.order.line o leer ítems).

## S2 - Política de facturación

Conteo de `invoice_policy` en `product.template` con `sale_ok = true` (total 7052):
- `order`: 7048
- `delivery`: 2 (id 57030 `BOB007GC` TOALLA GRIS CLARO DE BAÑO 480GR 30X45CM, tipo product; id 84531 `Service on Timesheet`, servicio interno)
- sin valor (false): 2 (`DISC` id 84635, `TIPS` id 84634, tipo consu, de Odoo)
- Por tipo/política: product/order 6862, product/delivery 1, consu/order 93, consu/sin valor 2, service/order 93, service/delivery 1 (suma 7052).
- Los 10 SKUs de muestra: todos `order`.

Decisión: con `order` el asistente `sale.advance.payment.inv` (`advance_payment_method: 'delivered'`) factura lo pedido aunque no esté entregado. Cubre el 99,9%. **Pedir a un admin de Odoo que pase BOB007GC (tmpl 57030) a `order`**; hasta entonces el backend debe detectar la política de las líneas y avisar/bloquear ese SKU. El usuario de la API no debe cambiar productos.

## S1 - Tipos de operación (outgoing)

| id | nombre | almacén | origen por defecto | secuencia |
|---|---|---|---|---|
| 2 | Despachos | Las Lomas (1) | LL/Salida (11) | OUT |
| 304 | Expediciones | Belgrano (40) | BL/Salida (375) | OUT |
| 348 | Expediciones | Alcorta (41) | AL/Salida (400) | OUT |
| **191** | **Despachos** | **Rolón Local (28)** | RL/Salida (177) | OUT |

Otros `outgoing` de esos almacenes (no usar para despacho): Pedidos TPV (LL 7, BL 312, AL 356, RL 196 inactivo), Baja por consumo interno (LL 280, RL 285), Órdenes de entrega de RMA (LL 325, RL 323, BL 329, AL 358).

**`settings.rolon.outPickingTypeId = 191`** ("Rolón Local: Despachos").

### Prueba de pedido mixto (ejecutada 2026-10-13, autorizada por el dueño)

Qué se hizo:
- Cliente: se reutilizó res.partner 18313 "PRUEBA" (no se creó ninguno).
- Productos (tracking none, stock libre): LL/Stock (8): 20351 `BCV136PT` BOWL VERDE AZULADO 20CM (22 u., 0 reservadas). RL/Stock (174): 68890 `MBA008NT` BANQUETA ALTA... (50 u., 0 reservadas).
- Llamadas y resultados:
  1. `sale.order create` {partner 18313, team 6, warehouse 1, ref PRUEBA-POS-1, 2 líneas qty 1, price_unit 1000} -> id 63352.
  2. `action_confirm` -> true. Pedido **S10849**, estado `sale`, pickings 192145 (LL/OUT/00258) y 192144 (LL/PICK/00177). El almacén 1 tiene `delivery_steps = pick_ship` (2 pasos): se generó un PICK (LL/Stock -> LL/Salida) con ambas líneas (moves 610885 y 610886) y un OUT (LL/Salida -> Clientes) con ambas (610883 y 610884), todos en `waiting`.
  3. `do_unreserve` sobre 192145 -> sin retorno (ok).
  4. `stock.picking create` {type 191, loc 174, dest 5 (Clientes), partner 18313, origin S10849, group 70997} -> 192146.
  5. `stock.move write` 610884 {picking_id 192146, location_id 174, picking_type_id 191, warehouse_id 28} -> true.
  6. `action_assign` [192146, 192145] -> true.
  7. Nunca se llamó a button_validate ni se marcaron cantidades.

Verificación tras el paso 6:

| Picking | Tipo | Estado | sale_id | Origen | Move | Estado move | Reservado |
|---|---|---|---|---|---|---|---|
| RL/OUT/08059 (192146) | 191 Rolón Local: Despachos | waiting | S10849 | RL/Stock (174) | 610884 MBA008NT | waiting | 0 |
| LL/OUT/00258 (192145) | 2 Las Lomas: Despachos | waiting | S10849 | LL/Salida (11) | 610883 BCV136PT | waiting | 0 |
| LL/PICK/00177 (192144) | 3 Las Lomas: Pick | (sin tocar) | S10849 | LL/Stock (8) | 610885, 610886 | waiting | 0 |

`sale.order` S10849: `picking_ids` = [192146, 192145, 192144], `delivery_count` = 3. No existen stock.move.line (nada reservado).

Conclusión:
- Funciona la parte estructural: el picking de Rolón (RL/OUT/08059) queda bajo el tipo 191, vinculado al pedido por `sale_id` (también por origin/group), con partner y origen RL/Stock.
- NO se logró la reserva desde 174: el move quedó `waiting` con 0 reservado, aunque RL/Stock tenía 50 libres. Causa probable: Las Lomas está en `pick_ship` y el move de Rolón seguía encadenado a su paso PICK (LL/Stock -> LL/Salida, move 610886, sin stock del producto en LL), que no se canceló ni reasignó; el OUT espera su origen.
- Para que funcione habría que, además de lo probado, sacar la línea de Rolón del PICK (cancelar el move 610886 o quitarlo de `move_orig_ids`) y repetir `action_assign` sobre 192146; o evitar el paso PICK. Esa variante NO fue probada (no estaba autorizada en el procedimiento).
- Aviso de diseño: confirmar un pedido en LL genera siempre 2 pickings (PICK + OUT); la línea de Rolón agrega un tercero.
- **Superado por el enfoque A** (decisión del dueño 2026-10-13, ver S1b): un pedido por depósito de origen, con PICK+OUT nativos. El tipo 191 es simplemente el OUT nativo de Rolón (dato informativo); el backend ya no crea pickings a mano.

Estado final: `action_cancel` (context lang es_AR, disable_cancel_warning) -> true. Pedido S10849 `cancel`; RL/OUT/08059, LL/OUT/00258 y LL/PICK/00177 los tres en `cancel` (no hizo falta `stock.picking.action_cancel`).

## S5 - Producto de envío

`product.product` 45870 existe: `default_code = EnvioParticular`, nombre "Envio particular pos", `active = true`, `sale_ok = true`, tipo `product`, `list_price = 0`, `invoice_policy = order` (tmpl 56919), impuesto 62 `IVA 21% Ventas` (21%, no incluido). Sirve para facturar envío; el precio se pone en la línea.

## Pedidos de prueba
S10849 (id 63352, ref PRUEBA-POS-1, cliente 18313 PRUEBA), cancelado junto con sus 3 pickings.

## S1b — Un pedido por depósito (prueba 2)

Ejecutada 2026-10-13, autorizada por el dueño. Cliente: res.partner 18313 "PRUEBA" (no se editó). Observación: no tiene `l10n_ar_afip_responsibility_type_id` (false) ni `vat`; tipo de identificación = "VAT" (id 1). Hay que completarlo en el cliente real antes de facturar de verdad.

Pedidos (todos team 6, `client_order_ref = PRUEBA-POS-2`, líneas qty 1, price_unit 1000):

| Pedido | id | Almacén | Líneas |
|---|---|---|---|
| S10850 | 63355 | Las Lomas (1) | A1 BOA005BL (LL/Stock); A2 IME031FS (LL/Exhibicion 324) |
| S10851 | 63356 | Rolón Local (28) | B1 BCV140CD (RL/Stock) |
| S10852 | 63357 | Belgrano (40) | C1 BTE095VE (BL/Stock) |

### Cadena PICK/OUT nativa tras action_confirm

| Pedido | PICK (id, tipo, estado) | OUT (id, tipo, estado) |
|---|---|---|
| S10850 | LL/PICK/00178 (192153) Las Lomas: Pick (tipo 3), LL/Stock -> LL/Salida, `assigned` | LL/OUT/00259 (192154) Las Lomas: Despachos (tipo 2), LL/Salida -> Clientes, `waiting` |
| S10851 | RL/PICK/08677 (192155) Rolón Local: Pick (tipo 192), RL/Stock -> RL/Salida, `assigned` | RL/OUT/08061 (192156) Rolón Local: Despachos (191), `waiting` |
| S10852 | BL/PICK/00026 (192157) Belgrano: Recogida (tipo 305), BL/Stock -> BL/Salida, `assigned` | BL/OUT/00030 (192158) Belgrano: Expediciones (tipo 304), `waiting` |

Moves: cada línea tiene un move PICK (`assigned`, reservado 1, `move_dest_ids` = move OUT) y un move OUT (`waiting`, `move_orig_ids` = move PICK). Ej. S10850: 611152->611150, 611153->611151. Rolón: 611155->611154. Belgrano: 611157->611156. Funciona nativo en los tres almacenes, sin tocar nada. El OUT queda `waiting` hasta validar el PICK (comportamiento normal de 2 pasos).

### Fix Exhibición (línea A2, move PICK 611153)

Odoo reservó el PICK desde LL/Stock (8) (move line 554617). Fix aplicado solo al PICK 192153: `stock.picking do_unreserve` -> `stock.move write {location_id: 324}` en 611153 -> `stock.picking action_assign`. Resultado: move line nueva 554722 con `location_id = 324 (LL/Exhibicion)`, reservado 1, move 611153 `assigned` con origen LL/Exhibicion; el move 611152 volvió a reservarse desde LL/Stock (8). El PICK sigue `assigned`, el OUT `waiting`. **Funciona.** Nota: `do_unreserve` libera todo el picking y `action_assign` re-reserva todas las líneas, por lo que las demás líneas se reasignan solas desde su origen.

### Factura única

`sale.advance.payment.inv` {advance_payment_method 'delivered', sale_order_ids [[6,0,[63355,63356,63357]]]} con context {active_model 'sale.order', active_ids, active_id 63355}; `create_invoices` devolvió `ir.actions.act_window_close`. Resultado: **UNA sola factura borrador** id 366482 (name "/", `out_invoice`, journal 10 "PTO. 2 Mayorista", partner 18313, 4 `invoice_line_ids`, amount_total 4000, `invoice_origin` "S10851, S10852, S10850"). Los tres pedidos tienen `invoice_ids = [366482]` e `invoice_status = invoiced`. Nunca se llamó a action_post.

### Estado final

- Factura 366482: `button_cancel` ok (state `cancel`), luego `unlink` **permitido** -> eliminada (ya no existe).
- `sale.order action_cancel` (context lang es_AR, disable_cancel_warning) sobre los tres: S10850, S10851, S10852 en `cancel`, `invoice_ids` vacío.
- Los 6 pickings (LL/PICK/00178, LL/OUT/00259, RL/PICK/08677, RL/OUT/08061, BL/PICK/00026, BL/OUT/00030) en `cancel` (no hizo falta `stock.picking.action_cancel`). Nunca se validó ni se marcó nada hecho.

### Conclusión y receta para el backend

1. Agrupar las líneas por almacén de origen. Crear un `sale.order` por almacén con el mismo partner y `client_order_ref`. **`team_id` sale del local que vende (no del almacén de origen): todos los pedidos de una misma venta usan el equipo del local vendedor; solo varía `warehouse_id` (= almacén de origen del grupo).** En la prueba se usó team 6 para los tres, coherente con esto.
2. `action_confirm` en cada uno: Odoo genera PICK + OUT nativos por almacén (sin mover moves entre pickings; no hace falta el tipo 191 manual).
3. Para líneas cuyo origen es una ubicación distinta de la de reserva por defecto (Exhibición 324): sobre el PICK de ese pedido, `do_unreserve`, `write location_id` en el move PICK de esa línea, `action_assign`.
4. Facturar con un solo asistente `sale.advance.payment.inv` (method 'delivered', todos los pedidos en `sale_order_ids` y en el contexto `active_ids`): produce una única factura borrador con las líneas de todos los pedidos. **El diario de la factura es el del local vendedor (LL 32, BL 65, AL 78), no el de los almacenes de origen: hay que escribir `journal_id` en la factura mientras está en borrador (como hace `postInvoice` de la feria) antes de publicar.** La factura de prueba tomó el diario por defecto 10 "PTO. 2 Mayorista", que no es el correcto. Publicar/ARCA es un paso aparte.
5. Cancelación: `action_cancel` por pedido cancela sus pickings; las facturas borrador se cancelan y se pueden eliminar con este usuario.

Pedidos de prueba 2: S10850 (63355), S10851 (63356), S10852 (63357), todos cancelados.
