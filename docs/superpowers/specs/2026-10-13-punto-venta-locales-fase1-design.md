# Punto de venta locales — Fase 1 (diseño)

Fecha: 2026-10-13
Estado: borrador para revisión

## 1. Objetivo

Reemplazar el Punto de Venta nativo de Odoo en los locales de Alto Rancho por
una app propia, adaptando la que funcionó en la feria outlet (`feria-alto`).
Misma metodología (vendedor arma → caja cobra y confirma → Odoo), aplicada a
locales, con tres paneles: **Vendedor**, **Caja** y **Admin**.

Éxito = las operaciones del instructivo actual que hoy obligan a saltar entre
módulos de Odoo, copiar/pegar números y hacer cuentas a mano se resuelven
desde el panel, sin poder "olvidarse" de un paso (ej. "Enviar más tarde").

### Lo que resuelve la Fase 1 (dolores del instructivo)

| Hoy | En el panel |
|---|---|
| Factura A: buscar constancia de CUIT en ARCA y cargar el contacto a mano en Odoo | CUIT → datos de ARCA → cliente creado/actualizado en Odoo |
| Productos con lote: buscar a mano un lote con stock en Rolón y pegarlo | El lote se elige solo (el de más stock en la ubicación de origen) |
| Venta desde Rolón: marcar "Enviar más tarde" o logística no ve el pedido | Origen y entrega por línea; el remito de Rolón se genera siempre |
| Envío/retiro: albarán con contacto "Envío a Domicilio" / "Local Las Lomas" | 4 modos de entrega explícitos con dirección correcta |
| Cuotas escritas en notas del cliente | Campos medio de pago + detalle |
| % de efectivo aplicado a mano / ítem "DESCUENTO POS" | Descuentos calculados automáticamente |
| Lista de precios decoradores elegida a mano | Promo automática si el cliente tiene la etiqueta |
| Cierre con 3 cajas de Odoo + mail con capturas | Caja del día con cierre por medio de pago guardado en la app |
| Historial del cliente en Contactos → Pedidos TPV | Historial desde el panel |

### Fuera de alcance (fases siguientes)

- **Fase 2 — Cambios y devoluciones:** líneas negativas, pedido original
  (local o Tiendanube), destino de lo devuelto, nota de crédito + factura
  nueva automáticas, saldo a favor.
- **Fase 3 — Web y stock del local:** retiros web (DNI, validar despacho EC,
  marcar retirado en Tiendanube), cobro de pedidos web, bajas web, recepción
  de mercadería, egresos/transferencias, fallas, movimientos web→local con
  aprobación de directivo.
- Mail automático de cierre de caja.
- De la feria se elimina: falla/discontinuo, precios por Excel, rebajas por
  SKU, panel Logística, página pública `/feria`, alerta de stock, etiquetas
  Zebra (salvo que se pidan).

## 2. Arquitectura

- **Frontend:** repo `punto-venta-altorancho` (copia de `feria-alto` @
  6eefad3), React + Vite. `feria-alto` queda intacto para próximas ferias.
- **Backend:** el mismo backend `Reportes` (Railway). Módulos nuevos `pos*.mjs`
  con rutas `/api/pos/*` y colecciones Firestore `pos_*`. Se copian y adaptan
  piezas de los módulos `feria*`; **los módulos de la feria no se modifican**.
- **Odoo** (v16) es la fuente de verdad de productos, precios, stock,
  clientes, pedidos, remitos y facturas. La app guarda en Firestore el estado
  propio (carritos, reservas, cajas, usuarios, configuración).
- Regla heredada: sin índices compuestos de Firestore — ordenar en código.

## 3. Locales y depósitos (Odoo)

| Local | Depósito | Ubicaciones vendibles | Equipo de ventas | Facturación |
|---|---|---|---|---|
| Las Lomas | LL (wh 1) | `LL/Stock` (8), `LL/Exhibicion` (324) | Punto de venta San Isidro (6) | Pto. 4 Facturas Las Lomas (journal 32) |
| Belgrano | BL (wh 40) | `BL/Stock` (372), `BL/Exhibicion` (379) | Punto de venta Belgrano (18) | **En pausa** — sin diario propio, a confirmar por facturación |
| Alcorta | AL (wh 41) | `AL/Stock` (397), `AL/Exhibición` (415) | Punto de venta Alcorta (25) | Pto. 12 Alcorta (journal 78) |

Depósitos compartidos:

- **Rolón:** RL (wh 28), `RL/Stock` (174). Vendible desde cualquier local
  (envío, retiro en local, retiro en Rolón).
- **Web:** EC (wh 24), `EC/Stock` (150). **Solo se muestra** (no se vende
  desde ahí en Fase 1). Ojo: `EC/Stock` suma ~1.900 millones de unidades —
  hay productos con stock "infinito" cargado; mostrar con tope/indicador y
  revisar con stock.
- **Otros locales:** se muestran; vender desde otro local queda sin definir
  (por ahora no).
- **Alcorta en Rolón** (AL/RL, wh 42, `AL/RL/Stock` 407): **sin definir**;
  no se usa en Fase 1 hasta que se aclare.

Todo esto es configurable desde Admin (no hardcodeado); los IDs son los
valores iniciales.

## 4. Paneles

### 4.1 Vendedor (`/vendedor`) — tablet y celular

- Login con PIN; el vendedor tiene un local asignado.
- Búsqueda por SKU o nombre (mínimo 4 caracteres, como la última versión de
  la feria). Cada resultado muestra foto, precio a cobrar (promo o full, con
  el full tachado si hay promo) y stock disponible: local (Stock /
  Exhibición), Rolón, Web y otros locales.
- Carrito persistente desde el primer producto (estado `carrito`), con
  reservas de stock en la app.
- Por línea: **origen** (Stock del local por defecto / Exhibición del local /
  Rolón) y **entrega** (ver §5.3).
- Línea **Envío** con monto a mano.
- Cliente por CUIT/DNI (ver §5.4).
- "Enviar a caja" → estado `pendiente`. Barra de acción fija abajo.

### 4.2 Caja (`/caja`) — escritorio, menú lateral izquierdo

Secciones del menú:

- **Pedidos:** cola del local (pendientes y con error), detalle editable
  (cliente, líneas, cantidades, origen, entrega, envío), cobro y confirmación.
  Caja también puede crear un pedido nuevo.
- **Caja del día:** apertura, movimientos, cierre (§5.6).
- **Historial:** pedidos del local; abrir, ver estado Odoo, anular.
- **Productos:** consulta de precio y stock en todas las ubicaciones.

### 4.3 Admin (`/admin`) — escritorio, menú lateral izquierdo

Usuarios: facturación, directivos, el dueño.

- **Locales:** depósito, ubicaciones vendibles, equipo de ventas, diario de
  facturación (vacío = no factura).
- **Usuarios:** alta/baja, PIN o contraseña, rol, local asignado (editable).
- **Medios de pago:** nombre, detalle (ej. cuotas), % descuento, mapeo a
  `payment.method` de Odoo, orden de prioridad para pago dividido.
- **Promociones y cupones** (§5.2).
- **Historial:** todos los locales, filtros por local / fecha / vendedor /
  medio de pago.
- **Estadísticas:** ventas por local, vendedor, medio de pago, producto.
- **Cajas:** sesiones de todos los locales con su cierre y diferencias.

### 4.4 Roles

| Rol | Login | Alcance |
|---|---|---|
| `vendedor` | PIN | su local, panel Vendedor |
| `caja` | usuario + contraseña | su local, panel Caja |
| `admin` | usuario + contraseña | todos los locales, panel Admin (y puede entrar a Caja de cualquier local) |
| `superadmin` | usuario + contraseña | admin + gestión de usuarios admin |

El backend valida rol y local en **cada** ruta (en la feria parte de esto
quedó solo en el front).

## 5. Reglas de negocio

### 5.1 Precio

- Precio base por producto = **precio promocional** de Odoo si tiene; si no,
  el **precio full**. (Campo/lista de origen en Odoo a confirmar — spike S3.)
- Los precios se leen de Odoo en vivo con caché corto; no hay Excel.

### 5.2 Descuentos (cascada)

1. Suma de líneas a precio base (promo o full) = total de productos.
2. **Descuento por medio de pago** sobre ese total (valores iniciales:
   efectivo 15 %, transferencia 20 %, tarjetas/cuotas 0 %) → **subtotal**.
3. **Descuento extra / cupón** sobre el subtotal (ej. 10 % por un motivo).
4. **Envío** se suma al final, sin descuentos.

Promociones y cupones (configurados en Admin):

- Tipo: % o monto fijo; activo/inactivo; vigencia opcional.
- Modo **cupón** (se ingresa un código) o **descuento con motivo** (caja lo
  elige de la lista habilitada).
- Condiciones opcionales: medio de pago requerido, etiqueta de cliente en
  Odoo requerida. Caso inicial: **decorador/arquitecto** = 5 % extra, solo
  efectivo, cliente con la etiqueta → se aplica solo.
- Vendedor no aplica descuentos; caja aplica solo los habilitados por Admin.
- Un descuento extra por pedido (además del de medio de pago).

### 5.3 Origen y entrega por línea

| Entrega | Origen permitido | En Odoo |
|---|---|---|
| Se lo lleva ahora | Stock o Exhibición del local | remito del local validado al confirmar |
| Retira otro día en el local | Rolón (o local, si se reserva para después) | remito pendiente, dirección = el local |
| Envío a domicilio | local o Rolón | remito pendiente, dirección del cliente |
| Retira en Rolón / otro local | Rolón | remito pendiente, dirección = punto de retiro |

### 5.4 Cliente

- Obligatorio: documento (CUIT o DNI), nombre, teléfono, email.
- **CUIT:** consulta al padrón de ARCA (constancia de inscripción) → razón
  social, condición de IVA, domicilio fiscal → crea/actualiza `res.partner`
  en Odoo con los campos de localización argentina.
- **DNI:** búsqueda en Odoo; si no existe, intento de padrón (CUIL derivado
  del DNI) y si no aparece, carga manual.
- Si el cliente ya existe en Odoo, se autocompleta (como en la feria).

### 5.5 Pago

- Campos **medio de pago** + **detalle de pago** (ej. Tarjeta crédito +
  6 cuotas). Mapeo a `sale.order.payment_method_ids` (modelo
  `payment.method`: Efectivo, Transferencia, Mercado Pago 1/3/6/12/18 cuotas,
  Débito, GoCuotas, etc.). Qué es exactamente "detalle de pago" para
  facturación — **a confirmar con admin**.
- **Pago dividido** permitido. Si se combinan medios con distinto descuento,
  aplica el de **menor descuento** a todo el pedido (ej. 50 % transferencia +
  50 % Mercado Pago → sin descuento de transferencia). En Odoo va el medio
  principal (el de menor descuento).
- La suma de las partes debe igualar el total para confirmar.

### 5.6 Caja del día (una por local)

- Una sesión abierta por local; sin caja abierta no se confirma.
- Apertura con monto inicial; muestra el cierre anterior del local.
- Movimientos: gasto / retiro (con motivo, anulables), ingreso en USD (monto
  y cotización).
- Cierre: totales por medio de pago, efectivo esperado vs contado, notas.
  Visible en Admin.
- Cómo se reflejan los cobros en los diarios de caja de Odoo (Caja Las
  Lomas, Caja Interna, Mercado Pago, USD…) — **a definir con facturación**;
  en Fase 1 la caja vive en la app.

### 5.7 Factura

- Opcional por pedido ("¿quiere factura?").
- A o B según la condición de IVA del cliente (Odoo decide el tipo de
  documento con la localización AR).
- Emitida por Odoo (CAE vía su integración con ARCA) en el diario del local.
  Se factura el **pedido completo** al confirmar, aunque haya líneas que se
  entregan después (spike S2).
- Local sin diario configurado (Belgrano hoy) → no ofrece factura.
- **Ninguna factura real hasta autorización explícita del dueño** (igual que
  en la feria: toggle por entorno).

### 5.8 Numeración y estados

- Número interno por local: `LL-0001`, `BL-0001`, `AL-0001` (contador por
  local en `pos_counters`). Va a `sale.order.client_order_ref`.
- Estados: `carrito` → `pendiente` → `confirmado` (pedido en Odoo) →
  `facturado` (si corresponde); `error` (reintento automático como en la
  feria); `anulado`; `descartado` (carrito vaciado).
- Anular: sin factura → cancelar el `sale.order` en Odoo y liberar reservas.
  Con factura → requiere nota de crédito → Fase 2 (en Fase 1 se bloquea y se
  deriva a facturación).

## 6. Odoo al confirmar

1. Crear/actualizar cliente.
2. Crear `sale.order`: cliente, `team_id` del local, `warehouse_id` del
   local, `payment_method_ids`, `client_order_ref` = número interno, líneas
   con `price_unit` = precio base y `discount` = % combinado de la cascada
   (prorrateado por línea), línea de envío.
3. Confirmar el pedido. Un remito por depósito de origen (local / Rolón) con
   la ubicación de origen exacta (Stock o Exhibición) y lote automático.
4. Validar los remitos de líneas "se lo lleva ahora".
5. Si pidió factura: crear y publicar factura en el diario del local.
6. Guardar en Firestore nombre del pedido Odoo (S0xxxx), remitos y factura.

Errores: cualquier falla deja el pedido en `error` con el mensaje, visible
en caja, con reintento automático con backoff (patrón `feriaRetry.mjs`) y
reintento manual. Confirmación con "claim" para evitar dobles confirmaciones
(patrón de la feria).

## 7. Datos (Firestore)

- `pos_orders` — pedido: local, vendedor, cliente, líneas (sku, cantidad,
  precio base, origen, entrega, dirección), envío, pagos, descuentos
  aplicados, totales, estado, refs Odoo, notas.
- `pos_reservations` — reservas por ubicación y SKU.
- `pos_cash_sessions` — sesiones de caja por local con movimientos y cierre.
- `pos_users` — vendedores, caja, admin (rol, local, PIN/contraseña con
  hash).
- `pos_locations` — configuración de locales.
- `pos_payment_methods` — medios de pago y %.
- `pos_promotions` — promociones y cupones.
- `pos_counters` — numeración por local.

Stock disponible mostrado = cantidad en Odoo por ubicación − reservado en
Odoo − reservas de la app.

## 8. Diseño visual

- Marca Alto Rancho: Poppins, blanco + #353434, minúsculas con punto.
- Caja y Admin: escritorio, menú lateral izquierdo, pensado para pantallas de
  notebook y monitor.
- Vendedor: tablet y celular, objetivos táctiles ≥ 44 px, inputs ≥ 16 px,
  acción principal fija abajo.
- Se elimina toda referencia a "feria".

## 9. Spikes antes de construir

- **S1 — Pedido con origen mixto:** cómo armar en Odoo un pedido de un local
  con líneas que salen de Rolón (rutas por línea vs. remito separado /
  cambio de ubicación de origen), de forma que logística lo vea en
  "Rolón Local → Despachos".
- **S2 — Facturar antes de entregar:** factura por cantidad pedida (política
  de facturación del producto o alternativa).
- **S3 — Precio promocional:** de qué campo o lista de precios sale, y si los
  precios de Odoo incluyen IVA.
- **S4 — ARCA padrón:** certificado y alta del servicio de constancia de
  inscripción; si Odoo ya trae la consulta, usarla.
- **S5 — Producto de envío:** ¿existe en Odoo? si no, lo crea un admin.

## 10. Pruebas

- Tests unitarios del backend: cascada de descuentos, pago dividido, promos y
  condiciones, reservas, armado del payload Odoo, permisos por rol/local.
- E2E real en Odoo por cada modo de entrega, con pedidos de prueba que se
  cancelan después (registrar cuáles).
- Sin facturas reales hasta autorización.

## 11. Pendientes con terceros

- Facturación: punto de venta de Belgrano; qué es "detalle de pago"; cómo
  registrar cobros en diarios de caja de Odoo.
- Stock: qué es "Alcorta en Rolón"; stock "infinito" en `EC/Stock`.
- Directivos: venta desde otros locales / web (por ahora no).
