# Punto de venta locales — Fase 2: cambios y devoluciones (diseño)

Fecha: 2026-10-16
Estado: borrador para revisión
Base: [Fase 1](2026-10-13-punto-venta-locales-fase1-design.md)

## 1. Objetivo

Resolver cambios y devoluciones desde el panel, sin entrar a Odoo ni hacer
cuentas a mano, con la misma metodología de la Fase 1 (se arma → caja cobra o
reintegra y confirma → Odoo).

Hoy la app solo anula ventas sin factura y sin nada movido; el resto responde
"la devolución se hace en Odoo" (`posConfirm.mjs`, `annulPosOrder`).

### Casos que entran (todos, con todas sus variantes)

1. **Cambio por otro producto** (talle, color, modelo): paga o recibe la
   diferencia.
2. **Devolución con reintegro de plata** (efectivo, anulación de tarjeta,
   transferencia).
3. **Devolución con saldo a favor.**
4. **Cambio o devolución de una compra web** (Tiendanube) traída al local.

Aunque por regla algún caso no corresponda, el panel lo permite: **cualquier
cajero** puede hacerlo, con **motivo obligatorio** y registro de quién lo
hizo. No hay aprobación de directivo.

### Decisiones tomadas

| Tema | Decisión |
|---|---|
| Quién autoriza excepciones | Cualquier cajero, motivo obligatorio, queda registrado |
| Compras originales | App, tickets del POS de Odoo, Tiendanube, y sin ticket |
| Destino de lo devuelto | Lista configurable por local (stock, exhibición, fallas, Rolón, etc.), se elige por línea |
| Saldo a favor | Se usa en cualquier local; vencimiento configurable; web después |
| Valor de lo devuelto | Lo pagado (descuentos prorrateados); sin ticket, precio de lista actual. Sin edición manual |
| Quién arma | El vendedor (y manda a caja) o la caja directamente |
| Modelo en Odoo | Documentos nativos enlazados al original (devolución de remito + nota de crédito + pedido nuevo) |

### Fuera de alcance

- Saldo a favor usable en la web (cupón Tiendanube).
- Retiros, cobros y bajas web, recepción de mercadería, etc. (Fase 3).
- Mail automático de cierre de caja.

## 2. Arquitectura

Igual que la Fase 1: frontend en este repo; backend `Reportes` con módulos
`pos*.mjs`, rutas `/api/pos/*` y colecciones `pos_*`. Odoo v16 es la fuente de
verdad de stock y documentos fiscales; la app guarda el estado propio. Sin
índices compuestos de Firestore.

Módulos nuevos previstos (nombres orientativos, se fijan en el plan):

- `posReturns.mjs` — líneas que vuelven: búsqueda de compras originales en los
  cuatro orígenes, valor a reintegrar, topes.
- `posReturnsOdoo.mjs` — devoluciones de remito, ingresos sueltos,
  transferencias a otro depósito, notas de crédito y su aplicación.
- `posCredits.mjs` — saldo a favor (alta, consumo, vencimiento, movimientos).

`posOrders`, `posConfirm`, `posCash` y `posRoutes` se extienden; la venta de
la Fase 1 no cambia de comportamiento.

## 3. Modelo: una operación con dos partes

Un cambio o devolución es un documento de `pos_orders`, igual que una venta,
con una parte nueva **`returnLines`** ("lo que vuelve") junto a las `lines`
de siempre ("lo nuevo"). Reutiliza numeración por local, cola de caja, cobro,
caja del día, historial y reintento automático.

| `returnLines` | `lines` | Tipo (`kind`) |
|---|---|---|
| sí | no | `devolucion` |
| sí | sí | `cambio` |
| no | sí | `venta` (Fase 1) |

Número: mismo contador del local (`LL-0042`); la cola y el historial muestran
la etiqueta del tipo.

### 3.1 Línea que vuelve

| Campo | Contenido |
|---|---|
| `source` | `app` · `tpv` · `web` · `manual` (sin ticket) |
| `sourceRef` | Pedido de la app / `pos.order` / `sale.order` web y la línea original (`sale.order.line` o `pos.order.line`) |
| `productId`, `sku`, `lotId` | Producto y lote que salió |
| `qtyBought`, `qtyReturnedBefore`, `qty` | Comprado, ya devuelto antes, a devolver ahora |
| `unitValue` | Valor unitario a reintegrar (§5.1) |
| `destinationId` | Destino del local (§4) |
| `reason`, `reasonNote` | Motivo de la lista + texto libre |
| `originalInvoiceId` | Factura original, si hubo |

### 3.2 Neto y resolución

`neto = total de lo nuevo − total de lo que vuelve`.

- **Neto > 0:** se cobra como una venta. Los descuentos por medio de pago
  (cascada de la Fase 1) se calculan **solo sobre la diferencia**.
- **Neto < 0:** la caja reparte el importe entre **reintegro** (medio + monto)
  y **saldo a favor**; tienen que sumar exactamente el neto, con la misma regla
  que el pago dividido.
- **Neto = 0:** no hay cobro ni reintegro.

## 4. Destinos de devolución (por local)

En Admin → Locales, cada local tiene una lista de destinos:

| Campo | Ejemplo |
|---|---|
| `label` | "Stock del local", "Exhibición", "Fallas", "Enviar a Rolón" |
| `locationId` | Ubicación de Odoo donde entra la devolución (siempre del local) |
| `transferToLocationId` | Opcional: ubicación de otro depósito a la que se manda después (p. ej. `RL/Stock`) |
| `default` | Uno por local |
| `active` | — |

Si el destino tiene `transferToLocationId`, la devolución entra al local (el
producto está físicamente ahí) y se crea además una **transferencia interna
pendiente** hacia ese depósito, que logística valida al retirarlo.

## 5. Reglas de negocio

### 5.1 Valor de lo devuelto

- Con compra original: lo pagado por unidad = precio de la línea con el
  descuento combinado de la cascada ya prorrateado (lo que figura en la línea
  de Odoo / del ticket). El envío y la subida al domicilio no se reintegran
  automáticamente.
- Sin ticket: precio de lista actual (misma lista que usa la Fase 1).
- La caja no puede editar el valor.

### 5.2 Topes

- `qty ≤ qtyBought − qtyReturnedBefore`. Lo devuelto antes se calcula leyendo
  de Odoo las devoluciones ya hechas sobre esa línea (incluidas las cargadas a
  mano en Odoo), no solo las de la app.
- Solo se devuelve lo **entregado**. Lo que todavía no salió (p. ej. envío
  desde Rolón pendiente) no se devuelve: se deriva a anular esa parte.
- Búsqueda de compras hacia atrás limitada por un ajuste (días).

### 5.3 Cliente

- La nota de crédito y el saldo son del **cliente de la compra original**.
- Si viene otra persona, se puede cambiar el titular con motivo.
- Sin ticket: se identifica al cliente igual que en una venta (DNI/CUIT, ARCA).

### 5.4 Lotes

La devolución entra con el **mismo lote** que salió. Sin ticket, el criterio
se fija tras el spike (lote más reciente del producto en el destino o lote
genérico).

### 5.5 Facturación

- La nota de crédito respeta el tipo (A/B) de la factura original y se emite
  en el diario del local que hace la operación.
- Lo nuevo se factura según el cliente actual, como en la Fase 1.
- Ningún comprobante real hasta autorización del dueño: mismo toggle por
  entorno que la Fase 1.

### 5.6 Motivos

Lista configurable en Ajustes (inicial: talle, falla, no le gustó, otro) +
texto libre. Obligatorio en cada línea que vuelve y en toda excepción (cambio
de titular, extensión de vencimiento).

### 5.7 Caja cerrada

Igual que en la Fase 1: sin caja abierta no se confirma.

## 6. Odoo al confirmar

Orden: **stock → nota de crédito → pedido nuevo → factura → aplicación**.
Cada paso guarda sus ids en la operación; si falla, queda `error` y el
reintento automático sigue desde el paso que faltó, sin duplicar.

### 6.1 Lo que vuelve → stock

| Origen | Documento |
|---|---|
| App | Devolución (`stock.return.picking`) del remito OUT validado del `sale.order`, con `to_refund`; Odoo baja la cantidad entregada |
| TPV | Devolución del remito del `pos.order` |
| Web | Devolución del remito del `sale.order` de la venta web en Odoo (se busca por número de pedido Tiendanube) |
| Sin ticket | Ingreso desde la ubicación de clientes al destino, con el cliente como contacto |

La ubicación de destino es `destinationId.locationId`. Si el destino tiene
`transferToLocationId`, se crea la transferencia interna pendiente (§4).

### 6.2 Lo que vuelve → nota de crédito

- **Original con factura (app, TPV o web):** nota de crédito parcial como
  reversión de su factura (`reversed_entry_id`), solo por las líneas y
  cantidades devueltas, en el diario del local que hace la operación (como ya
  hace el POS nativo). No se usa la facturación desde el `sale.order`: con
  `invoice_policy = order` la devolución no genera cantidad a facturar
  negativa (spike Fase 2).
- **Original sin factura:** sin nota de crédito; solo stock y registro en la
  app.
- **Sin ticket:** nota de crédito sin comprobante asociado, con el período
  como referencia (lo que exige ARCA en ese caso).

### 6.3 Lo nuevo

Pedido(s) y factura con el flujo de la Fase 1, sin cambios (un pedido por
depósito de origen, una factura).

### 6.4 Aplicación

La nota de crédito se aplica (concilia) contra la factura nueva por el
importe que corresponda. Lo que no se aplica queda como saldo a favor (§7).

La app no registra cobros en Odoo (como en la Fase 1), por eso el saldo vive
en la app y Odoo guarda el documento fiscal.

## 7. Saldo a favor

Colección `pos_credits`, un documento por crédito generado:

| Campo | Contenido |
|---|---|
| `customer` | DNI/CUIT, nombre, `partnerId` de Odoo |
| `amount`, `balance` | Monto original y disponible |
| `localId`, `orderId` | Dónde y en qué operación se generó |
| `creditNoteId` | Nota de crédito de Odoo, si hay |
| `createdAt`, `expiresAt` | `expiresAt` = alta + días del ajuste; `null` si el ajuste está vacío (no vence) |
| `movements` | Usos y ajustes: operación, monto, quién, cuándo, motivo |

- El vencimiento se fija al crear; cambiar el ajuste no afecta saldos ya
  emitidos.
- Al identificar al cliente (vendedor o caja), en cualquier local, se muestra
  "Tiene $ X a favor (vence dd/mm)".
- En caja, **"Saldo a favor"** es un medio de pago más: total o parcial,
  combinable en pago dividido. Se consume primero el que vence antes.
- Pagar con saldo **no** aplica descuento de efectivo.
- El consumo se hace en transacción de Firestore (dos cajas no gastan el mismo
  saldo). Al usarlo, la app aplica la nota de crédito a la factura nueva.
- Vencidos: no disponibles. Admin puede extender el vencimiento con motivo.
- El alta del saldo y el reintegro se escriben en la misma transacción que
  cierra la operación en la app.

## 8. Caja del día

- **Reintegro:** egreso por medio de pago. Efectivo resta del efectivo
  esperado; tarjeta y transferencia figuran como reintegros de su medio.
- **Saldo emitido:** no mueve plata; fila "saldos emitidos".
- **Saldo usado:** fila propia; no cuenta como ingreso de plata.
- El cierre muestra reintegros y saldos emitidos/usados.

## 9. Paneles

### 9.1 Vendedor (celular / tablet)

- Botón **"Cambio / devolución"** junto a "Nueva venta".
- **Paso 1 — buscar la compra:** un campo que acepta DNI/CUIT, número de la
  app, ticket TPV o pedido web; botón "Sin ticket". Por DNI/CUIT muestra las
  compras de los tres orígenes juntas, por fecha, con etiqueta Local/TPV/Web.
- **Paso 2 — qué vuelve:** cantidad (con tope), destino (desplegable, el
  predeterminado primero), motivo; valor a reintegrar por línea.
- **Paso 3 — lo nuevo (opcional):** el carrito de la Fase 1.
- Fijo abajo: neto ("Paga $ X" / "A favor del cliente $ X") y "Enviar a caja".

### 9.2 Caja (escritorio)

- **"Nueva operación"** con los mismos pasos.
- Cola con etiqueta de tipo.
- Detalle con bloques "Vuelve" (en negativo) y "Se lleva" y el neto.
  Neto > 0: PaymentBox de siempre (+ "Saldo a favor" si tiene). Neto < 0:
  reintegro (medio + monto) y/o saldo a favor, sumando el total.
- Tras confirmar: comprobante con los documentos generados y el saldo
  restante del cliente.
- Historial con filtro por tipo.

### 9.3 Admin

- **Locales:** destinos de devolución (§4).
- **Ajustes:** días de validez del saldo, motivos, días de búsqueda hacia
  atrás.
- **Saldos a favor** (nueva): buscar por cliente, movimientos, vencidos,
  extender vencimiento.
- **Historial y estadísticas:** muestran el tipo; las estadísticas restan lo
  devuelto.

## 10. Estados

Mismos estados de la Fase 1 (`carrito` → `pendiente` → `confirmado` →
`facturado`; `error`; `anulado`; `descartado`). El progreso de los pasos de
Odoo de la §6 se guarda en la operación (`returnSteps`) para reanudar.

Anular un cambio/devolución ya confirmado no entra en esta fase: se resuelve
en Odoo.

## 11. Spike antes del plan

No hay entorno de prueba: se hace sobre el Odoo real, sin publicar
comprobantes (todos los diarios de local son electrónicos). Etapa 1 (solo
lectura) hecha: `docs/superpowers/spikes/2026-10-fase2-odoo-spikes.md`.
Etapa 2 (escrituras sobre datos de prueba, revertidas; NC solo en borrador)
con autorización del dueño.

1. Devolución de remito OUT de un `sale.order` de la app con `to_refund` y
   cantidad entregada actualizada.
2. Devolución sobre el remito de un `pos.order` (ticket TPV) y cómo se
   encuentran los tickets (por cliente, por número).
3. Encontrar el `sale.order` de un pedido Tiendanube y devolver su remito.
4. Nota de crédito parcial con la localización argentina: desde el
   `sale.order` (app) y como reversión parcial (TPV/web); qué factura tienen
   los tickets TPV.
5. Nota de crédito sin comprobante asociado (sin ticket).
6. Aplicar una nota de crédito a una factura nueva del mismo cliente.
7. Ingreso suelto con lote (sin ticket) y transferencia interna pendiente a
   Rolón.
8. Cómo leer lo ya devuelto de una línea (para el tope).

Si algún punto no funciona como se espera, se ajusta este spec antes del plan.

## 12. Pruebas

- **Unitarias** (con `deps` inyectables, como hoy): valor prorrateado, topes,
  neto y reparto reintegro/saldo, descuentos sobre la diferencia, consumo de
  saldos por vencimiento, armado de documentos por origen, reanudación del
  reintento.
- **Punta a punta** al final (como `2026-10-e2e.md`): cada origen × devolución
  con reintegro / con saldo / cambio, y limpieza.
