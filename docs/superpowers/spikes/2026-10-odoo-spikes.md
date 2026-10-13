# Spikes de Odoo para el POS de locales (2026-10-13)

Todo en solo lectura (search_read / read / read_group / search_count). Odoo 16.

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
- Por tipo: product/order 6862, product/delivery 1, consu/order 93, service/order 93.
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

### Prueba de pedido mixto
Pendiente: requiere autorización del dueño.

(El controlador relayó una autorización, pero no la confirmó el dueño directamente; no se creó ningún pedido ni se escribió nada en Odoo.)

## S5 - Producto de envío

`product.product` 45870 existe: `default_code = EnvioParticular`, nombre "Envio particular pos", `active = true`, `sale_ok = true`, tipo `product`, `list_price = 0`, `invoice_policy = order` (tmpl 56919), impuesto 62 `IVA 21% Ventas` (21%, no incluido). Sirve para facturar envío; el precio se pone en la línea.

## Pedidos de prueba
Ninguno creado.
