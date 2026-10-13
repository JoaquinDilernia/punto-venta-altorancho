# Punto de venta locales — Fase 1 — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Punto de venta propio para los locales Las Lomas, Belgrano y Alcorta (vendedor → caja → Odoo), adaptado de la app de la feria, con panel Admin para configuración.

**Architecture:** Backend = el mismo `Reportes/backend` (Express + Firestore + Odoo JSON-RPC, Railway) con módulos nuevos `pos*.mjs` montados en `/api/pos`; reusa por import funciones genéricas de `feria*.mjs` sin modificarlas. Frontend = repo `punto-venta-altorancho` (React 18 + Vite, HashRouter), copia de `feria-alto` que se limpia y se reorganiza en tres paneles: `/vendedor` (tablet/celular), `/caja` y `/admin` (escritorio con menú lateral).

**Tech Stack:** Node 20 ESM, Express 4, firebase-admin 12, `node:test`; React 18, react-router-dom 6, CSS Modules, Vite 5. Nueva dependencia backend: `node-forge` (solo Task 14, firma CMS para ARCA).

**Spec:** `docs/superpowers/specs/2026-10-13-punto-venta-locales-fase1-design.md` (este repo).

## Global Constraints

- Repos: backend `C:\Users\Usuario\LETT COMERCIAL Dropbox\JOAQUIN DI LERNIA\DEV-JOAQUIN-DI-LERNIA\DEV-ALTORANCHO\Reportes` (rama `main`, producción en Railway); frontend `...\DEV-ALTORANCHO\punto-venta-altorancho` (rama `main`, remoto GitHub `JoaquinDilernia/punto-venta-altorancho`).
- **Los archivos `feria*.mjs`, `feriaRoutes.mjs`, `sync/feria.mjs` y el repo `feria-alto` NO se modifican.** Se importan funciones genéricas de ellos.
- Rutas nuevas bajo `/api/pos/*`; colecciones Firestore nuevas con prefijo `pos_`.
- **Sin índices compuestos de Firestore:** cada query usa un solo campo en `where` (igualdad o `in`); el orden y el resto del filtrado se hacen en código. Para combinar local + estado / local + mes se guardan campos compuestos (`queueKey = "LL_pendiente"`, `monthKey = "LL_2026-10"`).
- Precios que ve y guarda la app: **con IVA** (redondeados a 2 decimales). A Odoo viajan **sin IVA** (`price_unit = precio / 1.21`), porque los productos tienen "IVA 21% Ventas" (tax id 62, `price_include: false`).
- Descuentos en cascada: total de productos (promo si tiene, si no full) → descuento por medio de pago → **subtotal** → descuento extra/cupón sobre el subtotal → + envío (sin descuentos).
- Pago dividido: el pedido entero toma el **menor** descuento entre los medios usados.
- Valores iniciales de medios de pago: efectivo 15 %, transferencia 20 %, tarjetas 0 %.
- Número interno por local: `LL-0001`, `BL-0001`, `AL-0001`.
- Ningún pedido de prueba ni factura real en Odoo sin autorización explícita del dueño en el momento. Facturación apagada salvo que el local tenga `invoiceJournalId` y la variable `POS_INVOICING_ENABLED=true`.
- Antes de cualquier prueba en vivo: reiniciar el backend (un E2E de la feria corrió una vez con código viejo).
- Tests backend: `cd Reportes/backend && npm test` (corre `node --test test/**/*.test.mjs`). Hoy pasan 309.
- Textos de la UI en español rioplatense, sin la palabra "feria".
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Doble venta de la misma unidad:** dos vendedores del mismo local agregan la última unidad de `LL/Exhibicion` a la vez → uno solo la reserva, el otro ve "Sin stock suficiente". (Test en Task 7.)
2. **Pago dividido que no suma el total / cambia después de dividir:** caja divide el pago y luego edita una cantidad → confirmar se bloquea con el mensaje de montos. (Test en Task 8.)
3. **Usuario de un local operando otro:** un token de caja de `LL` pide `/api/pos/orders/:id` de un pedido `AL` → 403. (Test en Task 2 y Task 13.)
4. **Token de la feria usado en el POS:** un token válido de `/api/feria` no sirve en `/api/pos` (otro secreto y `app: 'pos'`). (Test en Task 2.)
5. **Reintento que duplica en Odoo:** un confirm que falla después de crear el `sale.order` y se reintenta no crea un segundo pedido. (Test en Task 10.)

---

## Mapa de archivos

Backend (`Reportes/backend/`):

| Archivo | Responsabilidad |
|---|---|
| `posAuth.mjs` | tokens (`app: 'pos'`, `POS_AUTH_SECRET`), login PIN / usuario+contraseña, middlewares de rol y de local |
| `posUsers.mjs` | ABM de usuarios `pos_users` (vendedor, caja, admin, superadmin) |
| `posConfig.mjs` | locales, medios de pago y ajustes generales (Firestore, con valores iniciales) |
| `posPricing.mjs` | puro: precio base, cascada de descuentos, medio principal |
| `posPromotions.mjs` | promociones/cupones: validación, vigencia, cuál aplica; ABM |
| `posCatalog.mjs` | búsqueda de productos en Odoo, precios full/promo, stock por grupo de ubicaciones |
| `posLines.mjs` | puro: modelo de línea, origen/entrega, reservas, número de pedido, reclamo de confirmación |
| `posStock.mjs` | reservas `pos_reservations` y disponible real (Odoo libre − reservas app) |
| `posOrders.mjs` | pedidos `pos_orders`: carrito, envío a caja, edición en caja, reclamo, estados, historial |
| `posOdoo.mjs` | cliente en Odoo, payload del `sale.order`, remitos por origen, factura del local |
| `posConfirm.mjs` | confirmar en Odoo (reintentable), reintento automático, anular |
| `posCash.mjs` | caja del día por local |
| `posStats.mjs` | estadísticas |
| `posArca.mjs` | padrón de ARCA (WSAA + constancia de inscripción) |
| `posRoutes.mjs` | router `/api/pos` |
| `sync/posLocales.mjs` | ventas de la app (sale.order de los equipos de locales) al dashboard de Reportes |
| `index.mjs` | montar `/api/pos`, arrancar reintento y seeds (solo agregar líneas) |

Frontend (`punto-venta-altorancho/client/src/`):

| Archivo | Responsabilidad |
|---|---|
| `lib/api.js`, `lib/session.js` | base `/api/pos`, sesiones `pos_session_{vendedor,caja,admin}` |
| `lib/money.js` | formato de pesos y cálculo de totales en vivo (espejo de `posPricing`) |
| `components/SidebarShell.jsx` | layout escritorio con menú lateral (Caja y Admin) |
| `components/StockBadges.jsx` | stock por grupo (local Stock/Exhibición, Rolón, Web, otros locales) |
| `components/CustomerForm.jsx` | CUIT/DNI → ARCA/Odoo, datos obligatorios |
| `components/LineEditor.jsx` | origen + entrega por línea |
| `pages/VendedorPanel.jsx` | panel vendedor (reescrito) |
| `pages/caja/*` | Caja: Pedidos, Cobro, Caja del día, Historial, Productos |
| `pages/admin/*` | Admin: Locales, Usuarios, Medios de pago, Promociones, Historial, Estadísticas, Cajas |

Se borran del front: `FeriaPublico`, `LogisticaPanel`, `EntregasView`, `CancelledItems`, `StockAlertsView`, `LabelsView`, `AddLabelButton`, `lib/feriaLabels.js`, `lib/labelQueue.js`, `lib/zebraLabels.*`, `VariosForm`, `ConditionChip`, `RebajasTab` (dentro de CajaPanel).

---

### Task 1: Spikes contra Odoo (decisiones antes de construir)

**Objetivo:** cerrar S1, S2, S3 y S5 del spec con evidencia, y dejar los IDs reales en un documento. **Pide autorización al dueño antes del paso 4** (crea un pedido de prueba real).

**Files:**
- Create: `punto-venta-altorancho/docs/superpowers/spikes/2026-10-odoo-spikes.md`
- Scripts descartables en el scratchpad de la sesión (no van a ningún repo).

Hallazgos ya verificados en Odoo (2026-10-13, solo lectura), para no repetirlos:
- Módulos AR instalados: `l10n_ar`, `l10n_ar_edi`, `l10n_ar_partner`… **no hay módulo de padrón ARCA** → la consulta la hace el backend (Task 14).
- Listas de precios con nombre por mes: `[314] [DESC0-MIN] Lista Minorista | Septiembre 2026`, `[313] [DESC0-GRAL] Tienda Nube Promocional | Septiembre 2026`, `[316] [DESC5-DEC] Lista Decoradora | Septiembre 2026`. Cambian de id cada mes → van en Ajustes del Admin, no hardcodeadas.
- `product.template.list_price` es **sin IVA** (tax 62 `price_include: false`).
- **No hay rutas `sale_selectable`** → no se puede elegir ruta por línea; el remito de Rolón se arma moviendo los movimientos a un remito propio (hipótesis S1).
- Etiqueta de cliente `Decorador/Arquitecto` = `res.partner.category` id **1**.
- Producto de envío usado hoy en el POS: `EnvioParticular` ("Envio particular pos", product.product 45870, precio 0).
- Medios de pago (`payment.method`): `[5] Efectivo`, `[6] Transferencia`, `[10] Mercado Pago Debito`, `[1] Mercado Pago 1 cuota`, `[2] … 3 cuotas`, `[3] … 6 cuotas`, `[4] … 12 cuotas`, `[21] … 18 cuotas`, `[7] Gocuotas`.

- [ ] **Step 1: S3 — de dónde sale el precio promocional.** Script de solo lectura: para 10 SKUs de locales con stock en `LL/Stock`, leer `product.pricelist.item` de las listas 313 y 314 (`applied_on`, `product_tmpl_id`, `product_id`, `compute_price`, `fixed_price`, `percent_price`, `base`, `date_start`, `date_end`) y compararlo con `list_price`. Responder: ¿el "precio full" es `list_price` o un ítem de la 314? ¿el "promocional" es un ítem `fixed` de la 313? ¿hay ítems por categoría o globales (`3_global`, `2_product_category`)? Anotar la regla exacta.

- [ ] **Step 2: S2 — política de facturación.** Leer `invoice_policy` de esos 10 productos (`product.template`) y contar cuántos productos vendibles (`sale_ok`) tienen `order` vs `delivery`. Con `order`, el asistente `sale.advance.payment.inv` (`advance_payment_method: 'delivered'`) factura lo pedido aunque no se haya entregado: es lo que necesitamos. Con `delivery`, solo factura lo entregado y una venta con envío no se podría facturar al cobrarla. Si hay productos en `delivery`, la decisión es pedirle a un admin de Odoo que los pase a `order` (el usuario de la API no debe cambiar productos). Dejar escrito el conteo y la decisión.

- [ ] **Step 3: S1 — tipos de operación.** Leer `stock.picking.type` de los almacenes LL (1), BL (40), AL (41) y RL (28) con `code = 'outgoing'` (`id`, `name`, `warehouse_id`, `default_location_src_id`, `sequence_code`). Anotar el id de "Rolón Local: Despachos" → será `settings.rolon.outPickingTypeId`.

- [ ] **Step 4: S1 — pedido con origen mixto (requiere autorización).** Con autorización, crear UN `sale.order` de prueba: cliente de prueba, `team_id` 6, `warehouse_id` 1, dos líneas (una de un SKU con stock en `LL/Stock`, otra de un SKU con stock en `RL/Stock`), `client_order_ref = "PRUEBA-POS-1"`. Confirmar. Luego aplicar la hipótesis:
  1. leer los `stock.move` del pedido;
  2. crear un `stock.picking` con `picking_type_id` = despachos de Rolón, `location_id = 174`, `location_dest_id` = el destino del move, `partner_id` = cliente, `origin` = nombre del pedido, `group_id` = el `group_id` del remito original;
  3. escribir en el move de Rolón `{ picking_id: <nuevo>, location_id: 174, picking_type_id: <despachos Rolón>, warehouse_id: 28 }`;
  4. `action_assign` en los dos remitos.
  Verificar: el remito nuevo aparece en Inventario → Rolón Local → Despachos, tiene `sale_id` = el pedido, reserva stock de `RL/Stock`, y validar el remito local con `button_validate` (contexto de `feriaDelivery.VALIDATE_CONTEXT`) funciona. Anotar todo. **Cancelar el pedido de prueba al terminar** y anotar su nombre (S0xxxxx) en el documento.

- [ ] **Step 5: Escribir `docs/superpowers/spikes/2026-10-odoo-spikes.md`** con: regla de precio full/promo (S3), política de facturación y decisión (S2), resultado de la hipótesis de remito de Rolón (S1) — si NO funcionó, **frenar y avisar al dueño antes de seguir con Task 9**, ids de tipos de operación, producto de envío (S5), pedidos de prueba creados/cancelados.

- [ ] **Step 6: Commit**

```bash
cd punto-venta-altorancho
git add docs/superpowers/spikes/2026-10-odoo-spikes.md
git commit -m "docs: resultados de los spikes de Odoo para el POS de locales"
```

---

### Task 2: Autenticación y usuarios del POS

**Files:**
- Create: `Reportes/backend/posAuth.mjs`, `Reportes/backend/posUsers.mjs`
- Test: `Reportes/backend/test/posAuth.test.mjs`, `Reportes/backend/test/posUsers.test.mjs`

**Interfaces:**
- Produces:
  - `generateToken(data, now?) → string`, `verifyToken(token, now?) → object|null` (exige `app === 'pos'`).
  - `hashSecret(value) → string` (HMAC-SHA256 hex con `POS_AUTH_SECRET`).
  - `isAdminRole(role) → boolean` (`admin`|`superadmin`).
  - `hasRole(user, roles) → boolean` (superadmin cuenta como admin).
  - `scopeLocalId(user, requestedLocalId) → string|null` (tira `Error` con `status = 403`).
  - `requirePosAuth`, `requirePosRole(...roles)` (Express middlewares; `req.posUser = { id, name, role, localId }`).
  - `loginWithPin(pin) → user|null`, `loginWithPassword(username, password) → user|null`, `seedSuperadminIfNeeded()`.
  - `posUsers`: `validateUserInput(input, { isNew, users, localeIds, selfId })`, `assertCanManage(actor, targetRole)`, `listUsers()`, `createUser(input, actor)`, `updateUser(id, input, actor)`, `deleteUser(id, actor)`.

- [ ] **Step 1: Test de tokens y permisos**

```js
// test/posAuth.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.POS_AUTH_SECRET = 'test-secret-pos';
process.env.FERIA_AUTH_SECRET = 'test-secret-feria';
const { generateToken, verifyToken, hasRole, scopeLocalId, isAdminRole } = await import('../posAuth.mjs');
const feria = await import('../feriaAuth.mjs');

test('verifyToken: acepta un token del POS y devuelve sus datos', () => {
  const token = generateToken({ id: 'u1', role: 'caja', localId: 'LL', name: 'Ana' });
  const decoded = verifyToken(token);
  assert.equal(decoded.id, 'u1');
  assert.equal(decoded.localId, 'LL');
  assert.equal(decoded.app, 'pos');
});

test('verifyToken: rechaza un token vencido', () => {
  const token = generateToken({ id: 'u1', role: 'caja' }, 0);
  assert.equal(verifyToken(token, 13 * 60 * 60 * 1000), null);
});

test('verifyToken: un token de la feria no sirve en el POS', () => {
  const token = feria.generateToken({ role: 'caja', id: 'x' });
  assert.equal(verifyToken(token), null);
});

test('verifyToken: basura y firma alterada → null', () => {
  assert.equal(verifyToken(''), null);
  assert.equal(verifyToken('abc'), null);
  const [payload] = generateToken({ id: 'u1', role: 'admin' }).split('.');
  assert.equal(verifyToken(`${payload}.firmafalsa`), null);
});

test('hasRole: superadmin cuenta como admin, no como caja', () => {
  assert.equal(hasRole({ role: 'superadmin' }, ['admin']), true);
  assert.equal(hasRole({ role: 'superadmin' }, ['caja']), false);
  assert.equal(hasRole({ role: 'caja' }, ['caja', 'admin']), true);
  assert.equal(isAdminRole('admin'), true);
  assert.equal(isAdminRole('vendedor'), false);
});

test('scopeLocalId: caja y vendedor quedan en su local; pedir otro es 403', () => {
  assert.equal(scopeLocalId({ role: 'caja', localId: 'LL' }, undefined), 'LL');
  assert.equal(scopeLocalId({ role: 'vendedor', localId: 'LL' }, 'LL'), 'LL');
  assert.throws(() => scopeLocalId({ role: 'caja', localId: 'LL' }, 'AL'), (err) => err.status === 403);
});

test('scopeLocalId: admin elige el local o ve todos (null)', () => {
  assert.equal(scopeLocalId({ role: 'admin' }, 'AL'), 'AL');
  assert.equal(scopeLocalId({ role: 'superadmin' }, undefined), null);
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd Reportes/backend && node --test test/posAuth.test.mjs`
Expected: FAIL — `Cannot find module '../posAuth.mjs'`.

- [ ] **Step 3: Implementar `posAuth.mjs`**

```js
// Sesiones del punto de venta de locales. Mismo esquema de token que la
// feria (payload + HMAC), pero con su propio secreto y marcado app: 'pos':
// un token de la feria nunca abre el POS ni al revés.
import 'dotenv/config';
import crypto from 'node:crypto';
import { getDb } from './firestore.mjs';

const TTL_SECONDS = 60 * 60 * 12; // un turno largo de local
export const USERS_COLLECTION = 'pos_users';
export const ROLES = ['vendedor', 'caja', 'admin', 'superadmin'];

function secret() {
  const value = process.env.POS_AUTH_SECRET;
  if (!value) throw new Error('Falta POS_AUTH_SECRET');
  return value;
}

const sign = (payload) => crypto.createHmac('sha256', secret()).update(payload).digest('base64url');

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// PIN y contraseñas se guardan como HMAC con el secreto del POS. Es
// determinístico a propósito: el login por PIN busca con un where por hash.
export function hashSecret(value) {
  return crypto.createHmac('sha256', secret()).update(String(value)).digest('hex');
}

export function generateToken(data, now = Date.now()) {
  const exp = now + TTL_SECONDS * 1000;
  const payload = Buffer.from(JSON.stringify({ ...data, app: 'pos', exp })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token, now = Date.now()) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  try {
    if (!safeEqual(sign(payload), signature)) return null;
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (decoded.app !== 'pos') return null;
    if (typeof decoded.exp !== 'number' || now >= decoded.exp) return null;
    return decoded;
  } catch {
    return null;
  }
}

export const isAdminRole = (role) => role === 'admin' || role === 'superadmin';

// superadmin puede todo lo de admin; admin no entra como caja ni vendedor.
export function hasRole(user, roles) {
  if (!user) return false;
  if (roles.includes(user.role)) return true;
  return user.role === 'superadmin' && roles.includes('admin');
}

function forbidden(message) {
  const err = new Error(message);
  err.status = 403;
  return err;
}

// Local sobre el que opera el pedido: vendedor y caja, siempre el suyo;
// admin, el que pida (o null = todos).
export function scopeLocalId(user, requestedLocalId) {
  if (isAdminRole(user.role)) return requestedLocalId || null;
  if (requestedLocalId && requestedLocalId !== user.localId) throw forbidden('No tenés acceso a ese local');
  return user.localId;
}

export function sessionUser(id, data) {
  return { id, name: data.name, role: data.role, localId: data.localId ?? null };
}

export async function loginWithPin(pin) {
  if (!/^\d{4,6}$/.test(String(pin ?? ''))) return null;
  const snap = await getDb().collection(USERS_COLLECTION).where('pinHash', '==', hashSecret(pin)).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const data = doc.data();
  if (data.role !== 'vendedor' || data.active === false) return null;
  return sessionUser(doc.id, data);
}

export async function loginWithPassword(username, password) {
  const name = String(username ?? '').toLowerCase().trim();
  if (!name || !password) return null;
  const snap = await getDb().collection(USERS_COLLECTION).where('username', '==', name).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const data = doc.data();
  if (data.role === 'vendedor' || data.active === false) return null;
  if (!safeEqual(data.passwordHash, hashSecret(password))) return null;
  return sessionUser(doc.id, data);
}

// Primer superadmin, desde variables de entorno (sin contraseñas en el código).
export async function seedSuperadminIfNeeded() {
  const username = process.env.POS_SUPERADMIN_USERNAME?.toLowerCase().trim();
  const password = process.env.POS_SUPERADMIN_INITIAL_PASSWORD;
  if (!username || !password) return;
  const db = getDb();
  const existing = await db.collection(USERS_COLLECTION).where('role', '==', 'superadmin').limit(1).get();
  if (!existing.empty) return;
  await db.collection(USERS_COLLECTION).add({
    name: process.env.POS_SUPERADMIN_NAME || username, username, role: 'superadmin', localId: null,
    passwordHash: hashSecret(password), active: true, createdAt: new Date(),
  });
  console.log('[pos] superadmin inicial creado:', username);
}

export function requirePosAuth(req, res, next) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'No autenticado' });
  req.posUser = { id: decoded.id, name: decoded.name, role: decoded.role, localId: decoded.localId ?? null };
  next();
}

export function requirePosRole(...roles) {
  return (req, res, next) => {
    if (!hasRole(req.posUser, roles)) return res.status(403).json({ error: 'Acceso restringido' });
    next();
  };
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `node --test test/posAuth.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 5: Test de validación de usuarios**

```js
// test/posUsers.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.POS_AUTH_SECRET = 'test-secret-pos';
const { validateUserInput, assertCanManage } = await import('../posUsers.mjs');
const { hashSecret } = await import('../posAuth.mjs');

const localeIds = ['LL', 'BL', 'AL'];

test('vendedor: necesita nombre, local y PIN de 4 a 6 números', () => {
  const errors = validateUserInput({ role: 'vendedor', name: '', localId: 'XX', pin: '12' }, { isNew: true, users: [], localeIds });
  assert.deepEqual(errors, ['Falta el nombre', 'Local inválido', 'El PIN tiene que tener de 4 a 6 números']);
});

test('vendedor: el PIN no se puede repetir con otro vendedor', () => {
  const users = [{ id: 'a', role: 'vendedor', pinHash: hashSecret('1234') }];
  const errors = validateUserInput({ role: 'vendedor', name: 'Ana', localId: 'LL', pin: '1234' }, { isNew: true, users, localeIds });
  assert.deepEqual(errors, ['Ese PIN ya lo usa otro vendedor']);
  assert.deepEqual(validateUserInput({ role: 'vendedor', name: 'Ana', localId: 'LL', pin: '1234' }, { isNew: false, users, localeIds, selfId: 'a' }), []);
});

test('caja: usuario y contraseña (mín. 6) al crear; local obligatorio', () => {
  const errors = validateUserInput({ role: 'caja', name: 'Caja Lomas', username: '', password: '123' }, { isNew: true, users: [], localeIds });
  assert.deepEqual(errors, ['Local inválido', 'Falta el usuario', 'La contraseña tiene que tener al menos 6 caracteres']);
});

test('caja: al editar, la contraseña vacía deja la que tenía', () => {
  const errors = validateUserInput({ role: 'caja', name: 'Caja', username: 'caja.lomas', localId: 'LL' }, { isNew: false, users: [], localeIds, selfId: 'c' });
  assert.deepEqual(errors, []);
});

test('usuario repetido → error', () => {
  const users = [{ id: 'x', role: 'caja', username: 'caja.lomas' }];
  const errors = validateUserInput({ role: 'admin', name: 'Fac', username: 'Caja.Lomas', password: '123456' }, { isNew: true, users, localeIds });
  assert.deepEqual(errors, ['Ese usuario ya existe']);
});

test('assertCanManage: admin maneja vendedor y caja; solo superadmin maneja admins', () => {
  assert.doesNotThrow(() => assertCanManage({ role: 'admin' }, 'caja'));
  assert.throws(() => assertCanManage({ role: 'admin' }, 'admin'), /super admin/);
  assert.doesNotThrow(() => assertCanManage({ role: 'superadmin' }, 'superadmin'));
  assert.throws(() => assertCanManage({ role: 'caja' }, 'vendedor'), /permiso/);
});
```

- [ ] **Step 6: Correr y ver que falla**

Run: `node --test test/posUsers.test.mjs` → FAIL (`Cannot find module '../posUsers.mjs'`).

- [ ] **Step 7: Implementar `posUsers.mjs`**

```js
// ABM de usuarios del POS. Vendedores entran con PIN; caja y admin con
// usuario y contraseña. Admin maneja vendedores y cajas; solo el superadmin
// maneja admins.
import { getDb } from './firestore.mjs';
import { USERS_COLLECTION, ROLES, hashSecret, isAdminRole } from './posAuth.mjs';

const PASSWORD_ROLES = new Set(['caja', 'admin', 'superadmin']);

export function validateUserInput(input, { isNew, users, localeIds, selfId = null }) {
  const errors = [];
  const role = input.role;
  if (!ROLES.includes(role)) return ['Rol inválido'];
  if (!String(input.name ?? '').trim()) errors.push('Falta el nombre');
  if ((role === 'vendedor' || role === 'caja') && !localeIds.includes(input.localId)) errors.push('Local inválido');
  const others = users.filter((u) => u.id !== selfId);
  if (role === 'vendedor') {
    const pin = String(input.pin ?? '');
    if (isNew || pin) {
      if (!/^\d{4,6}$/.test(pin)) errors.push('El PIN tiene que tener de 4 a 6 números');
      else if (others.some((u) => u.role === 'vendedor' && u.pinHash === hashSecret(pin))) errors.push('Ese PIN ya lo usa otro vendedor');
    }
  }
  if (PASSWORD_ROLES.has(role)) {
    const username = String(input.username ?? '').toLowerCase().trim();
    if (!username) errors.push('Falta el usuario');
    else if (others.some((u) => u.username === username)) errors.push('Ese usuario ya existe');
    const password = String(input.password ?? '');
    if ((isNew || password) && password.length < 6) errors.push('La contraseña tiene que tener al menos 6 caracteres');
  }
  return errors;
}

export function assertCanManage(actor, targetRole) {
  if (!isAdminRole(actor.role)) throw Object.assign(new Error('No tenés permiso para manejar usuarios'), { status: 403 });
  if (isAdminRole(targetRole) && actor.role !== 'superadmin') {
    throw Object.assign(new Error('Solo el super admin maneja usuarios admin'), { status: 403 });
  }
}

function publicUser(id, data) {
  return {
    id, name: data.name, role: data.role, localId: data.localId ?? null,
    username: data.username ?? null, active: data.active !== false,
  };
}

async function readAll() {
  const snap = await getDb().collection(USERS_COLLECTION).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listUsers() {
  return (await readAll())
    .map((u) => publicUser(u.id, u))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

function toDoc(input, existing = {}) {
  const doc = {
    name: input.name.trim(), role: input.role,
    localId: input.role === 'vendedor' || input.role === 'caja' ? input.localId : null,
    active: input.active !== false, updatedAt: new Date(),
  };
  if (input.role === 'vendedor') {
    if (input.pin) doc.pinHash = hashSecret(input.pin);
    doc.username = null;
    doc.passwordHash = null;
  } else {
    doc.username = input.username.toLowerCase().trim();
    if (input.password) doc.passwordHash = hashSecret(input.password);
    doc.pinHash = null;
  }
  return { ...existing, ...doc };
}

export async function createUser(input, actor, localeIds) {
  assertCanManage(actor, input.role);
  const errors = validateUserInput(input, { isNew: true, users: await readAll(), localeIds });
  if (errors.length) throw new Error(errors.join('; '));
  const ref = await getDb().collection(USERS_COLLECTION).add({ ...toDoc(input), createdAt: new Date() });
  return { id: ref.id };
}

export async function updateUser(id, input, actor, localeIds) {
  const users = await readAll();
  const current = users.find((u) => u.id === id);
  if (!current) throw new Error('Usuario no encontrado');
  assertCanManage(actor, current.role);
  assertCanManage(actor, input.role);
  const errors = validateUserInput(input, { isNew: false, users, localeIds, selfId: id });
  if (errors.length) throw new Error(errors.join('; '));
  const { id: _omit, ...existing } = current;
  await getDb().collection(USERS_COLLECTION).doc(id).set(toDoc(input, existing));
}

export async function deleteUser(id, actor) {
  if (id === actor.id) throw new Error('No podés borrar tu propio usuario');
  const users = await readAll();
  const current = users.find((u) => u.id === id);
  if (!current) throw new Error('Usuario no encontrado');
  assertCanManage(actor, current.role);
  if (current.role === 'superadmin' && users.filter((u) => u.role === 'superadmin').length === 1) {
    throw new Error('No se puede borrar el último super admin');
  }
  await getDb().collection(USERS_COLLECTION).doc(id).delete();
}
```

- [ ] **Step 8: Correr los dos tests y la suite completa**

Run: `node --test test/posAuth.test.mjs test/posUsers.test.mjs && npm test`
Expected: PASS; la suite sigue verde (309 + nuevos).

- [ ] **Step 9: Commit**

```bash
cd Reportes
git add backend/posAuth.mjs backend/posUsers.mjs backend/test/posAuth.test.mjs backend/test/posUsers.test.mjs
git commit -m "feat(pos): sesiones y usuarios del punto de venta de locales"
```

---

### Task 3: Configuración (locales, medios de pago, ajustes)

**Files:**
- Create: `Reportes/backend/posConfig.mjs`
- Test: `Reportes/backend/test/posConfig.test.mjs`

**Interfaces:**
- Produces:
  - Constantes `DEFAULT_LOCALES`, `DEFAULT_SETTINGS`, `DEFAULT_PAYMENT_METHODS`.
  - Puras: `validateLocale(input) → string[]`, `validatePaymentMethod(input) → string[]`, `validateSettings(input) → string[]`, `resolveOdooPaymentName(method, detailId) → string|null`, `originLocationId(locale, settings, origin) → number`, `localeIdsOf(locales) → string[]`.
  - Firestore (caché 30 s): `getLocales()`, `getLocale(id)`, `saveLocale(id, input)`, `getSettings()`, `saveSettings(input)`, `getPaymentMethods()`, `getPaymentMethodsById()`, `savePaymentMethod(id, input)`, `seedPosConfigIfNeeded()`, `clearConfigCache()`.
  - Tipos:
    - Locale: `{ id: 'LL', name, warehouseId, stockLocationId, exhibicionLocationId, teamId, invoiceJournalId|null, address, active }`
    - Settings: `{ rolon: { warehouseId, locationId, outPickingTypeId|null }, web: { locationId }, fullPricelistId|null, promoPricelistId|null, shippingProductSku, decoradorTagId }`
    - PaymentMethod: `{ id, label, discountPct, odooName|null, details: [{ id, label, odooName }], order, active }`

- [ ] **Step 1: Test**

```js
// test/posConfig.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LOCALES, DEFAULT_SETTINGS, DEFAULT_PAYMENT_METHODS, validateLocale, validatePaymentMethod,
  resolveOdooPaymentName, originLocationId,
} from '../posConfig.mjs';

const lomas = DEFAULT_LOCALES.find((l) => l.id === 'LL');

test('valores iniciales: tres locales con sus ubicaciones de Odoo', () => {
  assert.deepEqual(DEFAULT_LOCALES.map((l) => l.id), ['LL', 'BL', 'AL']);
  assert.equal(lomas.stockLocationId, 8);
  assert.equal(lomas.exhibicionLocationId, 324);
  assert.equal(DEFAULT_LOCALES.find((l) => l.id === 'BL').invoiceJournalId, 65);
  assert.equal(DEFAULT_SETTINGS.rolon.locationId, 174);
});

test('valores iniciales: efectivo 15 %, transferencia 20 %, tarjetas 0 %', () => {
  const pct = Object.fromEntries(DEFAULT_PAYMENT_METHODS.map((m) => [m.id, m.discountPct]));
  assert.equal(pct.efectivo, 15);
  assert.equal(pct.transferencia, 20);
  assert.equal(pct.debito, 0);
  assert.equal(pct.credito, 0);
});

test('originLocationId: stock / exhibición del local, o Rolón', () => {
  assert.equal(originLocationId(lomas, DEFAULT_SETTINGS, 'stock'), 8);
  assert.equal(originLocationId(lomas, DEFAULT_SETTINGS, 'exhibicion'), 324);
  assert.equal(originLocationId(lomas, DEFAULT_SETTINGS, 'rolon'), 174);
  assert.throws(() => originLocationId(lomas, DEFAULT_SETTINGS, 'web'), /Origen inválido/);
});

test('resolveOdooPaymentName: el detalle (cuotas) manda sobre el medio', () => {
  const credito = DEFAULT_PAYMENT_METHODS.find((m) => m.id === 'credito');
  assert.equal(resolveOdooPaymentName(credito, '6'), 'Mercado Pago 6 cuotas');
  assert.throws(() => resolveOdooPaymentName(credito, null), /Elegí el detalle/);
  const efectivo = DEFAULT_PAYMENT_METHODS.find((m) => m.id === 'efectivo');
  assert.equal(resolveOdooPaymentName(efectivo, null), 'Efectivo');
});

test('validateLocale: ids numéricos de Odoo obligatorios; diario opcional', () => {
  assert.deepEqual(validateLocale({ ...lomas, invoiceJournalId: null }), []);
  assert.deepEqual(validateLocale({ ...lomas, name: '', stockLocationId: 'x' }), ['Falta el nombre', 'Ubicación de stock inválida']);
});

test('validatePaymentMethod: descuento entre 0 y 100', () => {
  const m = { id: 'efectivo', label: 'Efectivo', discountPct: 120, odooName: 'Efectivo', details: [] };
  assert.deepEqual(validatePaymentMethod(m), ['El descuento tiene que estar entre 0 y 100']);
});
```

- [ ] **Step 2: Correr y ver que falla** — `node --test test/posConfig.test.mjs` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar `posConfig.mjs`**

```js
// Configuración del POS de locales, editable desde el panel Admin. Los ids
// de Odoo de los valores iniciales se verificaron el 2026-10-13 (ver spec).
import { getDb } from './firestore.mjs';

const LOCALES = 'pos_locales';
const PAYMENT_METHODS = 'pos_payment_methods';
const SETTINGS_REF = (db) => db.collection('pos_settings').doc('general');
const CACHE_MS = 30 * 1000;

export const DEFAULT_LOCALES = [
  { id: 'LL', name: 'Las Lomas', warehouseId: 1, stockLocationId: 8, exhibicionLocationId: 324, teamId: 6, invoiceJournalId: 32, address: '', active: true },
  { id: 'BL', name: 'Belgrano', warehouseId: 40, stockLocationId: 372, exhibicionLocationId: 379, teamId: 18, invoiceJournalId: 65, address: '', active: true },
  { id: 'AL', name: 'Alcorta', warehouseId: 41, stockLocationId: 397, exhibicionLocationId: 415, teamId: 25, invoiceJournalId: 78, address: '', active: true },
];

export const DEFAULT_SETTINGS = {
  rolon: { warehouseId: 28, locationId: 174, outPickingTypeId: null },
  web: { locationId: 150 },
  fullPricelistId: null,
  promoPricelistId: null,
  shippingProductSku: 'EnvioParticular',
  decoradorTagId: 1,
};

const cuotas = (n, name) => ({ id: String(n), label: n === 1 ? '1 cuota' : `${n} cuotas`, odooName: name });

export const DEFAULT_PAYMENT_METHODS = [
  { id: 'efectivo', label: 'Efectivo', discountPct: 15, odooName: 'Efectivo', details: [], order: 1, active: true },
  { id: 'transferencia', label: 'Transferencia', discountPct: 20, odooName: 'Transferencia', details: [], order: 2, active: true },
  { id: 'debito', label: 'Tarjeta débito', discountPct: 0, odooName: 'Mercado Pago Debito', details: [], order: 3, active: true },
  {
    id: 'credito', label: 'Tarjeta crédito', discountPct: 0, odooName: null, order: 4, active: true,
    details: [
      cuotas(1, 'Mercado Pago 1 cuota'), cuotas(3, 'Mercado Pago 3 cuotas'), cuotas(6, 'Mercado Pago 6 cuotas'),
      cuotas(12, 'Mercado Pago 12 cuotas'), cuotas(18, 'Mercado Pago 18 cuotas'),
    ],
  },
  { id: 'gocuotas', label: 'GoCuotas', discountPct: 0, odooName: 'Gocuotas', details: [], order: 5, active: true },
];

const isId = (v) => Number.isInteger(v) && v > 0;

export function validateLocale(input) {
  const errors = [];
  if (!String(input.name ?? '').trim()) errors.push('Falta el nombre');
  if (!isId(input.warehouseId)) errors.push('Depósito inválido');
  if (!isId(input.stockLocationId)) errors.push('Ubicación de stock inválida');
  if (!isId(input.exhibicionLocationId)) errors.push('Ubicación de exhibición inválida');
  if (!isId(input.teamId)) errors.push('Equipo de ventas inválido');
  if (input.invoiceJournalId != null && !isId(input.invoiceJournalId)) errors.push('Diario de facturas inválido');
  return errors;
}

export function validatePaymentMethod(input) {
  const errors = [];
  if (!String(input.label ?? '').trim()) errors.push('Falta el nombre');
  const pct = input.discountPct;
  if (typeof pct !== 'number' || !Number.isFinite(pct) || pct < 0 || pct > 100) errors.push('El descuento tiene que estar entre 0 y 100');
  const details = input.details ?? [];
  if (!details.length && !String(input.odooName ?? '').trim()) errors.push('Falta el medio de pago de Odoo');
  for (const d of details) {
    if (!String(d.label ?? '').trim() || !String(d.odooName ?? '').trim()) errors.push('Cada detalle necesita nombre y medio de Odoo');
  }
  return errors;
}

export function validateSettings(input) {
  const errors = [];
  if (!isId(input.rolon?.warehouseId) || !isId(input.rolon?.locationId)) errors.push('Rolón: depósito y ubicación obligatorios');
  if (input.rolon?.outPickingTypeId != null && !isId(input.rolon.outPickingTypeId)) errors.push('Rolón: tipo de operación inválido');
  if (!isId(input.web?.locationId)) errors.push('Web: ubicación obligatoria');
  for (const key of ['fullPricelistId', 'promoPricelistId']) {
    if (input[key] != null && !isId(input[key])) errors.push(`Lista de precios inválida (${key})`);
  }
  if (!String(input.shippingProductSku ?? '').trim()) errors.push('Falta el SKU del producto de envío');
  return errors;
}

// Nombre exacto del payment.method de Odoo ("Medio de pago" del pedido).
export function resolveOdooPaymentName(method, detailId) {
  if (method.details?.length) {
    const detail = method.details.find((d) => d.id === detailId);
    if (!detail) throw new Error(`Elegí el detalle de ${method.label} (cuotas)`);
    return detail.odooName;
  }
  return method.odooName;
}

export const ORIGINS = ['stock', 'exhibicion', 'rolon'];

export function originLocationId(locale, settings, origin) {
  if (origin === 'stock') return locale.stockLocationId;
  if (origin === 'exhibicion') return locale.exhibicionLocationId;
  if (origin === 'rolon') return settings.rolon.locationId;
  throw new Error(`Origen inválido: ${origin}`);
}

export const localeIdsOf = (locales) => locales.map((l) => l.id);

// ---- Firestore con caché corta ----
let cache = { at: 0, locales: null, settings: null, methods: null };
export function clearConfigCache() {
  cache = { at: 0, locales: null, settings: null, methods: null };
}
const fresh = () => Date.now() - cache.at < CACHE_MS;

async function loadAll() {
  if (fresh() && cache.locales) return cache;
  const db = getDb();
  const [locSnap, methodSnap, settingsSnap] = await Promise.all([
    db.collection(LOCALES).get(), db.collection(PAYMENT_METHODS).get(), SETTINGS_REF(db).get(),
  ]);
  cache = {
    at: Date.now(),
    locales: locSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name, 'es')),
    methods: methodSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 99) - (b.order ?? 99)),
    settings: { ...DEFAULT_SETTINGS, ...(settingsSnap.exists ? settingsSnap.data() : {}) },
  };
  return cache;
}

export async function getLocales() {
  return (await loadAll()).locales;
}

export async function getLocale(id) {
  const locale = (await getLocales()).find((l) => l.id === id);
  if (!locale) throw new Error(`Local desconocido: ${id}`);
  return locale;
}

export async function getSettings() {
  return (await loadAll()).settings;
}

export async function getPaymentMethods() {
  return (await loadAll()).methods;
}

export async function getPaymentMethodsById() {
  return new Map((await getPaymentMethods()).map((m) => [m.id, m]));
}

export async function saveLocale(id, input) {
  const errors = validateLocale(input);
  if (errors.length) throw new Error(errors.join('; '));
  const { id: _omit, ...data } = input;
  await getDb().collection(LOCALES).doc(id).set({ ...data, updatedAt: new Date() });
  clearConfigCache();
}

export async function saveSettings(input) {
  const errors = validateSettings(input);
  if (errors.length) throw new Error(errors.join('; '));
  await SETTINGS_REF(getDb()).set({ ...input, updatedAt: new Date() });
  clearConfigCache();
}

export async function savePaymentMethod(id, input) {
  const errors = validatePaymentMethod(input);
  if (errors.length) throw new Error(errors.join('; '));
  const { id: _omit, ...data } = input;
  await getDb().collection(PAYMENT_METHODS).doc(id).set({ ...data, updatedAt: new Date() });
  clearConfigCache();
}

// Carga los valores iniciales solo si la colección está vacía.
export async function seedPosConfigIfNeeded() {
  const db = getDb();
  const [locSnap, methodSnap] = await Promise.all([
    db.collection(LOCALES).limit(1).get(), db.collection(PAYMENT_METHODS).limit(1).get(),
  ]);
  if (locSnap.empty) {
    for (const { id, ...data } of DEFAULT_LOCALES) await db.collection(LOCALES).doc(id).set(data);
    console.log('[pos] locales iniciales cargados');
  }
  if (methodSnap.empty) {
    for (const { id, ...data } of DEFAULT_PAYMENT_METHODS) await db.collection(PAYMENT_METHODS).doc(id).set(data);
    console.log('[pos] medios de pago iniciales cargados');
  }
  clearConfigCache();
}
```

- [ ] **Step 4: Correr** — `node --test test/posConfig.test.mjs` → PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/posConfig.mjs backend/test/posConfig.test.mjs
git commit -m "feat(pos): configuración de locales, medios de pago y ajustes"
```

---

### Task 4: Precios y cascada de descuentos (puro)

**Files:**
- Create: `Reportes/backend/posPricing.mjs`
- Test: `Reportes/backend/test/posPricing.test.mjs`

**Interfaces:**
- Produces:
  - `IVA_RATE = 0.21`, `round2(n)`, `withIva(net)`, `netOfIva(gross)`.
  - `basePriceOf({ fullPrice, promoPrice }) → number` (promo si es > 0 y menor que el full).
  - `paymentDiscountPct(payments, methodsById) → number` (menor % entre los medios; sin pagos → 0).
  - `principalPayment(payments, methodsById) → { methodId, detailId }` (el de menor descuento; empate → el primero).
  - `extraDiscountAmount(extra, subtotal) → number` (`extra = { type: 'pct'|'amount', value }`).
  - `computeTotals({ lines, payments, methodsById, extraDiscount, shippingAmount }) → { products, paymentPct, paymentDiscount, subtotal, extraDiscount, shipping, total, lineDiscountPct }`.
  - Una línea para precios es `{ qty, basePrice, status }` (las `status === 'eliminado'` no suman).
  - Un pago es `{ methodId, detailId?, amount? }`.

- [ ] **Step 1: Test**

```js
// test/posPricing.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  basePriceOf, paymentDiscountPct, principalPayment, computeTotals, netOfIva, withIva, extraDiscountAmount,
} from '../posPricing.mjs';

const methodsById = new Map([
  ['efectivo', { id: 'efectivo', discountPct: 15 }],
  ['transferencia', { id: 'transferencia', discountPct: 20 }],
  ['credito', { id: 'credito', discountPct: 0 }],
]);

test('basePriceOf: promo si tiene y es menor; si no, full', () => {
  assert.equal(basePriceOf({ fullPrice: 1000, promoPrice: 800 }), 800);
  assert.equal(basePriceOf({ fullPrice: 1000, promoPrice: null }), 1000);
  assert.equal(basePriceOf({ fullPrice: 1000, promoPrice: 0 }), 1000);
  assert.equal(basePriceOf({ fullPrice: 1000, promoPrice: 1200 }), 1000);
});

test('IVA: ida y vuelta con 2 decimales', () => {
  assert.equal(withIva(1000), 1210);
  assert.equal(netOfIva(1210), 1000);
});

test('paymentDiscountPct: un medio → su %, varios → el menor, ninguno → 0', () => {
  assert.equal(paymentDiscountPct([{ methodId: 'transferencia' }], methodsById), 20);
  assert.equal(paymentDiscountPct([{ methodId: 'transferencia' }, { methodId: 'credito' }], methodsById), 0);
  assert.equal(paymentDiscountPct([{ methodId: 'transferencia' }, { methodId: 'efectivo' }], methodsById), 15);
  assert.equal(paymentDiscountPct([], methodsById), 0);
  assert.throws(() => paymentDiscountPct([{ methodId: 'bitcoin' }], methodsById), /Medio de pago inválido/);
});

test('principalPayment: el de menor descuento va a Odoo', () => {
  const p = principalPayment([{ methodId: 'transferencia' }, { methodId: 'credito', detailId: '6' }], methodsById);
  assert.deepEqual(p, { methodId: 'credito', detailId: '6' });
});

test('computeTotals: ejemplo del spec (100.000, efectivo 15 %, extra 10 %)', () => {
  const t = computeTotals({
    lines: [{ qty: 1, basePrice: 60000 }, { qty: 2, basePrice: 20000 }, { qty: 5, basePrice: 999, status: 'eliminado' }],
    payments: [{ methodId: 'efectivo' }], methodsById,
    extraDiscount: { type: 'pct', value: 10 }, shippingAmount: 0,
  });
  assert.equal(t.products, 100000);
  assert.equal(t.paymentDiscount, 15000);
  assert.equal(t.subtotal, 85000);
  assert.equal(t.extraDiscount, 8500);
  assert.equal(t.total, 76500);
  assert.equal(t.lineDiscountPct, 23.5);
});

test('computeTotals: el envío se suma al final sin descuentos', () => {
  const t = computeTotals({
    lines: [{ qty: 1, basePrice: 10000 }], payments: [{ methodId: 'transferencia' }], methodsById,
    extraDiscount: null, shippingAmount: 5000,
  });
  assert.equal(t.subtotal, 8000);
  assert.equal(t.shipping, 5000);
  assert.equal(t.total, 13000);
  assert.equal(t.lineDiscountPct, 20);
});

test('extraDiscountAmount: monto fijo nunca supera el subtotal', () => {
  assert.equal(extraDiscountAmount({ type: 'amount', value: 5000 }, 3000), 3000);
  assert.equal(extraDiscountAmount({ type: 'amount', value: 500 }, 3000), 500);
  assert.equal(extraDiscountAmount(null, 3000), 0);
});

test('computeTotals: pedido vacío no divide por cero', () => {
  const t = computeTotals({ lines: [], payments: [], methodsById, extraDiscount: { type: 'pct', value: 10 }, shippingAmount: 0 });
  assert.equal(t.total, 0);
  assert.equal(t.lineDiscountPct, 0);
});
```

- [ ] **Step 2: Correr y ver que falla** — `node --test test/posPricing.test.mjs` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar `posPricing.mjs`**

```js
// Precios del POS. Todo con IVA (lo que ve el cliente); a Odoo viaja sin IVA
// porque los productos tienen "IVA 21% Ventas" no incluido en el precio.
// Cascada: productos → descuento por medio de pago → subtotal → descuento
// extra sobre el subtotal → + envío (sin descuentos).
export const IVA_RATE = 0.21;
export const round2 = (n) => Math.round(n * 100) / 100;
export const withIva = (net) => round2(net * (1 + IVA_RATE));
export const netOfIva = (gross) => round2(gross / (1 + IVA_RATE));

export function basePriceOf({ fullPrice, promoPrice }) {
  if (typeof promoPrice === 'number' && promoPrice > 0 && promoPrice < fullPrice) return promoPrice;
  return fullPrice;
}

function methodOf(methodsById, methodId) {
  const method = methodsById.get(methodId);
  if (!method) throw new Error(`Medio de pago inválido: ${methodId}`);
  return method;
}

// Pago dividido: manda el medio con menos descuento (50 % transferencia +
// 50 % tarjeta → sin el descuento de transferencia).
export function paymentDiscountPct(payments, methodsById) {
  if (!payments?.length) return 0;
  return Math.min(...payments.map((p) => methodOf(methodsById, p.methodId).discountPct));
}

export function principalPayment(payments, methodsById) {
  if (!payments?.length) throw new Error('Cargá al menos un medio de pago');
  let best = payments[0];
  for (const p of payments) {
    if (methodOf(methodsById, p.methodId).discountPct < methodOf(methodsById, best.methodId).discountPct) best = p;
  }
  return { methodId: best.methodId, detailId: best.detailId ?? null };
}

export function extraDiscountAmount(extra, subtotal) {
  if (!extra || subtotal <= 0) return 0;
  if (extra.type === 'pct') return round2(subtotal * extra.value / 100);
  if (extra.type === 'amount') return round2(Math.min(extra.value, subtotal));
  throw new Error(`Tipo de descuento inválido: ${extra.type}`);
}

export function computeTotals({ lines, payments, methodsById, extraDiscount = null, shippingAmount = 0 }) {
  const active = (lines ?? []).filter((l) => l.status !== 'eliminado');
  const products = round2(active.reduce((sum, l) => sum + l.qty * l.basePrice, 0));
  const paymentPct = paymentDiscountPct(payments, methodsById);
  const paymentDiscount = round2(products * paymentPct / 100);
  const subtotal = round2(products - paymentDiscount);
  const extra = extraDiscountAmount(extraDiscount, subtotal);
  const shipping = round2(shippingAmount || 0);
  const total = round2(subtotal - extra + shipping);
  // Un solo % por línea en Odoo que reproduce la cascada (puede diferir en
  // centavos del total de la app por el redondeo de Odoo).
  const extraPct = subtotal > 0 ? extra / subtotal : 0;
  const lineDiscountPct = products > 0 ? round2(100 * (1 - (1 - paymentPct / 100) * (1 - extraPct))) : 0;
  return { products, paymentPct, paymentDiscount, subtotal, extraDiscount: extra, shipping, total, lineDiscountPct };
}
```

- [ ] **Step 4: Correr** — `node --test test/posPricing.test.mjs` → PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/posPricing.mjs backend/test/posPricing.test.mjs
git commit -m "feat(pos): cascada de descuentos y medio de pago principal"
```

---

### Task 5: Promociones y cupones

**Files:**
- Create: `Reportes/backend/posPromotions.mjs`
- Test: `Reportes/backend/test/posPromotions.test.mjs`

**Interfaces:**
- Consumes: `getDb` (`firestore.mjs`).
- Produces:
  - Promoción: `{ id, name, kind: 'cupon'|'motivo'|'auto', code|null, type: 'pct'|'amount', value, active, from|null, to|null, requiresPaymentMethodId|null, requiresCustomerTagId|null }`.
    - `cupon`: caja escribe el código. `motivo`: caja la elige de la lista. `auto`: se aplica sola si se cumplen las condiciones (decorador/arquitecto).
  - `validatePromotion(input, others) → string[]`
  - `isPromotionActive(promo, now) → boolean`
  - `promotionApplies(promo, { paymentMethodIds, customerTagIds, now }) → { ok, reason? }`
  - `resolveExtraDiscount(promotions, { code, promotionId }, ctx) → { promotionId, name, type, value } | null` (tira `Error` si el código/motivo no sirve).
  - `listPromotions()`, `listActivePromotions(now)`, `savePromotion(id|null, input) → id`.

- [ ] **Step 1: Test**

```js
// test/posPromotions.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePromotion, isPromotionActive, promotionApplies, resolveExtraDiscount } from '../posPromotions.mjs';

const NOW = new Date('2026-10-20T15:00:00-03:00').getTime();
const decorador = {
  id: 'deco', name: 'Decorador/Arquitecto', kind: 'auto', type: 'pct', value: 5, active: true,
  requiresPaymentMethodId: 'efectivo', requiresCustomerTagId: 1, from: null, to: null, code: null,
};
const cupon = { id: 'c1', name: 'Cupón 10', kind: 'cupon', code: 'HOLA10', type: 'pct', value: 10, active: true, from: null, to: null };
const motivo = { id: 'm1', name: 'Cliente frecuente', kind: 'motivo', type: 'amount', value: 2000, active: true, from: null, to: null };
const vencida = { ...cupon, id: 'c2', code: 'VIEJO', to: '2026-10-01' };

test('isPromotionActive: respeta activo y fechas (fecha "hasta" inclusive)', () => {
  assert.equal(isPromotionActive(cupon, NOW), true);
  assert.equal(isPromotionActive({ ...cupon, active: false }, NOW), false);
  assert.equal(isPromotionActive(vencida, NOW), false);
  assert.equal(isPromotionActive({ ...cupon, from: '2026-10-21' }, NOW), false);
  assert.equal(isPromotionActive({ ...cupon, to: '2026-10-20' }, NOW), true);
});

test('promotionApplies: decorador solo con efectivo y cliente con la etiqueta', () => {
  assert.equal(promotionApplies(decorador, { paymentMethodIds: ['efectivo'], customerTagIds: [1], now: NOW }).ok, true);
  assert.equal(promotionApplies(decorador, { paymentMethodIds: ['efectivo', 'credito'], customerTagIds: [1], now: NOW }).ok, false);
  assert.equal(promotionApplies(decorador, { paymentMethodIds: ['efectivo'], customerTagIds: [], now: NOW }).ok, false);
});

test('resolveExtraDiscount: cupón por código (sin distinguir mayúsculas)', () => {
  const r = resolveExtraDiscount([cupon, motivo], { code: 'hola10' }, { paymentMethodIds: ['credito'], customerTagIds: [], now: NOW });
  assert.deepEqual(r, { promotionId: 'c1', name: 'Cupón 10', type: 'pct', value: 10 });
});

test('resolveExtraDiscount: código inexistente o vencido → error claro', () => {
  const ctx = { paymentMethodIds: ['credito'], customerTagIds: [], now: NOW };
  assert.throws(() => resolveExtraDiscount([cupon], { code: 'NADA' }, ctx), /no existe/);
  assert.throws(() => resolveExtraDiscount([vencida], { code: 'VIEJO' }, ctx), /no está vigente/);
});

test('resolveExtraDiscount: la elección de caja gana sobre la automática; sin elección, aplica la automática', () => {
  const ctx = { paymentMethodIds: ['efectivo'], customerTagIds: [1], now: NOW };
  assert.equal(resolveExtraDiscount([decorador, motivo], { promotionId: 'm1' }, ctx).promotionId, 'm1');
  assert.equal(resolveExtraDiscount([decorador, motivo], {}, ctx).promotionId, 'deco');
  assert.equal(resolveExtraDiscount([decorador], {}, { ...ctx, customerTagIds: [] }), null);
});

test('resolveExtraDiscount: un motivo que pide otro medio de pago → error', () => {
  const soloEfectivo = { ...motivo, requiresPaymentMethodId: 'efectivo' };
  assert.throws(
    () => resolveExtraDiscount([soloEfectivo], { promotionId: 'm1' }, { paymentMethodIds: ['credito'], customerTagIds: [], now: NOW }),
    /solo con/,
  );
});

test('validatePromotion: % entre 1 y 100, monto > 0, cupón con código único', () => {
  assert.deepEqual(validatePromotion({ ...cupon, value: 150 }, []), ['El porcentaje tiene que estar entre 1 y 100']);
  assert.deepEqual(validatePromotion({ ...motivo, value: 0 }, []), ['El monto tiene que ser mayor a 0']);
  assert.deepEqual(validatePromotion({ ...cupon, code: '' }, []), ['El cupón necesita un código']);
  assert.deepEqual(validatePromotion({ ...cupon, id: 'otro' }, [cupon]), ['Ya hay un cupón activo con ese código']);
});
```

- [ ] **Step 2: Correr y ver que falla** — `node --test test/posPromotions.test.mjs` → FAIL.

- [ ] **Step 3: Implementar `posPromotions.mjs`**

```js
// Descuentos extra sobre el subtotal (después del descuento por medio de
// pago). Uno solo por pedido: el que elige caja (cupón o motivo) o, si no
// eligió nada, el automático que corresponda (decorador/arquitecto).
import { getDb } from './firestore.mjs';

const COLLECTION = 'pos_promotions';
const KINDS = ['cupon', 'motivo', 'auto'];

// Fechas 'YYYY-MM-DD' en hora de Argentina; "hasta" incluye el día entero.
const dayStart = (ymd) => new Date(`${ymd}T00:00:00-03:00`).getTime();
const dayEnd = (ymd) => new Date(`${ymd}T23:59:59.999-03:00`).getTime();

export function isPromotionActive(promo, now = Date.now()) {
  if (promo.active === false) return false;
  if (promo.from && now < dayStart(promo.from)) return false;
  if (promo.to && now > dayEnd(promo.to)) return false;
  return true;
}

export function promotionApplies(promo, { paymentMethodIds = [], customerTagIds = [], now = Date.now() }) {
  if (!isPromotionActive(promo, now)) return { ok: false, reason: `${promo.name} no está vigente` };
  if (promo.requiresPaymentMethodId && (paymentMethodIds.length === 0 || paymentMethodIds.some((m) => m !== promo.requiresPaymentMethodId))) {
    return { ok: false, reason: `${promo.name} vale solo con ${promo.requiresPaymentMethodId}` };
  }
  if (promo.requiresCustomerTagId && !customerTagIds.includes(promo.requiresCustomerTagId)) {
    return { ok: false, reason: `${promo.name} es solo para clientes con esa etiqueta en Odoo` };
  }
  return { ok: true };
}

const asDiscount = (p) => ({ promotionId: p.id, name: p.name, type: p.type, value: p.value });

export function resolveExtraDiscount(promotions, { code, promotionId } = {}, ctx) {
  let chosen = null;
  if (code) {
    const wanted = String(code).trim().toUpperCase();
    const matches = promotions.filter((p) => p.kind === 'cupon' && String(p.code ?? '').toUpperCase() === wanted);
    if (!matches.length) throw new Error(`El cupón ${wanted} no existe`);
    chosen = matches.find((p) => isPromotionActive(p, ctx.now)) ?? matches[0];
  } else if (promotionId) {
    chosen = promotions.find((p) => p.id === promotionId && p.kind !== 'cupon');
    if (!chosen) throw new Error('Ese descuento no existe');
  }
  if (chosen) {
    const check = promotionApplies(chosen, ctx);
    if (!check.ok) throw new Error(check.reason);
    return asDiscount(chosen);
  }
  const auto = promotions.find((p) => p.kind === 'auto' && promotionApplies(p, ctx).ok);
  return auto ? asDiscount(auto) : null;
}

export function validatePromotion(input, others) {
  const errors = [];
  if (!String(input.name ?? '').trim()) errors.push('Falta el nombre');
  if (!KINDS.includes(input.kind)) errors.push('Tipo de promoción inválido');
  if (input.type === 'pct') {
    if (!(input.value >= 1 && input.value <= 100)) errors.push('El porcentaje tiene que estar entre 1 y 100');
  } else if (input.type === 'amount') {
    if (!(typeof input.value === 'number' && input.value > 0)) errors.push('El monto tiene que ser mayor a 0');
  } else {
    errors.push('Elegí porcentaje o monto');
  }
  if (input.kind === 'cupon') {
    const code = String(input.code ?? '').trim().toUpperCase();
    if (!code) errors.push('El cupón necesita un código');
    else if (others.some((p) => p.id !== input.id && p.kind === 'cupon' && p.active !== false && String(p.code).toUpperCase() === code)) {
      errors.push('Ya hay un cupón activo con ese código');
    }
  }
  if (input.from && input.to && input.from > input.to) errors.push('La fecha "desde" es posterior a "hasta"');
  return errors;
}

export async function listPromotions() {
  const snap = await getDb().collection(COLLECTION).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export async function listActivePromotions(now = Date.now()) {
  return (await listPromotions()).filter((p) => isPromotionActive(p, now));
}

export async function savePromotion(id, input) {
  const all = await listPromotions();
  const clean = {
    name: String(input.name ?? '').trim(), kind: input.kind, type: input.type, value: Number(input.value),
    code: input.kind === 'cupon' ? String(input.code ?? '').trim().toUpperCase() : null,
    active: input.active !== false, from: input.from || null, to: input.to || null,
    requiresPaymentMethodId: input.requiresPaymentMethodId || null,
    requiresCustomerTagId: input.requiresCustomerTagId ? Number(input.requiresCustomerTagId) : null,
  };
  const errors = validatePromotion({ ...clean, id }, all);
  if (errors.length) throw new Error(errors.join('; '));
  const col = getDb().collection(COLLECTION);
  if (id) {
    await col.doc(id).set({ ...clean, updatedAt: new Date() });
    return id;
  }
  const ref = await col.add({ ...clean, createdAt: new Date(), updatedAt: new Date() });
  return ref.id;
}
```

- [ ] **Step 4: Correr** — `node --test test/posPromotions.test.mjs` → PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/posPromotions.mjs backend/test/posPromotions.test.mjs
git commit -m "feat(pos): promociones, cupones y descuento decorador/arquitecto"
```

---

### Task 6: Catálogo — búsqueda, precios y stock desde Odoo

**Files:**
- Create: `Reportes/backend/posCatalog.mjs`
- Test: `Reportes/backend/test/posCatalog.test.mjs`

**Interfaces:**
- Consumes: `callKwReadWithRetry` (`feriaOdoo.mjs`); `withIva`, `basePriceOf` (`posPricing.mjs`); tipos Locale/Settings (Task 3).
- Produces:
  - Producto de catálogo `CatalogProduct = { productId, templateId, sku, name, fullPrice, promoPrice|null, basePrice }` (precios con IVA).
  - Puras: `priceFromItems(product, items) → number|null` (sin IVA), `freeByLocation(quants) → Map<productId, Map<locationId, number>>`, `groupStock({ freeByLoc, appReserved, locales, settings, localId }) → StockView`, `stockLocationIds(locales, settings) → number[]`.
    - `StockView = { local: { stock, exhibicion }|null, rolon, web: { qty|null, unlimited }, otros: [{ localId, name, qty }] }`
    - `freeByLoc` y `appReserved` son `Map<locationId, number>` de UN producto.
  - E/S: `searchCatalog(query, settings) → CatalogProduct[]` (máx. 30), `getCatalogProducts(productIds, settings) → Map<productId, CatalogProduct>`, `fetchFreeStock(productIds, locationIds) → Map<productId, Map<locationId, number>>`.
- **Depende del Spike S3 (Task 1).** Este código implementa la regla más probable: full = `lst_price` (o la lista `fullPricelistId` si está configurada) y promo = ítem `fixed`/`percentage` de la lista `promoPricelistId` para la variante o la plantilla. Si el spike encontró otra regla (ítems por categoría o globales), ajustar `priceFromItems` y sus tests antes de seguir.

- [ ] **Step 1: Test**

```js
// test/posCatalog.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceFromItems, freeByLocation, groupStock } from '../posCatalog.mjs';
import { DEFAULT_LOCALES, DEFAULT_SETTINGS } from '../posConfig.mjs';

const product = { id: 10, product_tmpl_id: [100, 'X'], lst_price: 1000 };

test('priceFromItems: ítem de variante gana sobre el de plantilla', () => {
  const items = [
    { applied_on: '1_product', product_tmpl_id: [100, 'X'], product_id: false, compute_price: 'fixed', fixed_price: 900 },
    { applied_on: '0_product_variant', product_tmpl_id: false, product_id: [10, 'X'], compute_price: 'fixed', fixed_price: 850 },
  ];
  assert.equal(priceFromItems(product, items), 850);
});

test('priceFromItems: porcentaje sobre el precio de lista; sin ítem → null', () => {
  const items = [{ applied_on: '1_product', product_tmpl_id: [100, 'X'], product_id: false, compute_price: 'percentage', percent_price: 20 }];
  assert.equal(priceFromItems(product, items), 800);
  assert.equal(priceFromItems(product, []), null);
});

test('freeByLocation: cantidad menos lo reservado en Odoo, sumado por ubicación', () => {
  const quants = [
    { product_id: [10, 'X'], location_id: [8, 'LL/Stock'], quantity: 5, reserved_quantity: 2 },
    { product_id: [10, 'X'], location_id: [8, 'LL/Stock'], quantity: 1, reserved_quantity: 0 },
    { product_id: [10, 'X'], location_id: [174, 'RL/Stock'], quantity: 3, reserved_quantity: 3 },
  ];
  const result = freeByLocation(quants).get(10);
  assert.equal(result.get(8), 4);
  assert.equal(result.get(174), 0);
});

test('groupStock: local, Rolón, web y otros locales, descontando reservas de la app', () => {
  const freeByLoc = new Map([[8, 4], [324, 1], [174, 7], [150, 2], [372, 3], [379, 0], [397, 1], [415, 2]]);
  const appReserved = new Map([[8, 1], [174, 2]]);
  const view = groupStock({ freeByLoc, appReserved, locales: DEFAULT_LOCALES, settings: DEFAULT_SETTINGS, localId: 'LL' });
  assert.deepEqual(view.local, { stock: 3, exhibicion: 1 });
  assert.equal(view.rolon, 5);
  assert.deepEqual(view.web, { qty: 2, unlimited: false });
  assert.deepEqual(view.otros, [{ localId: 'AL', name: 'Alcorta', qty: 3 }, { localId: 'BL', name: 'Belgrano', qty: 3 }]);
});

test('groupStock: stock web absurdo se muestra como "sin límite"', () => {
  const view = groupStock({
    freeByLoc: new Map([[150, 1900000000]]), appReserved: new Map(),
    locales: DEFAULT_LOCALES, settings: DEFAULT_SETTINGS, localId: 'LL',
  });
  assert.deepEqual(view.web, { qty: null, unlimited: true });
});
```

- [ ] **Step 2: Correr y ver que falla** — `node --test test/posCatalog.test.mjs` → FAIL.

- [ ] **Step 3: Implementar `posCatalog.mjs`**

```js
// Productos, precios y stock del POS, leídos de Odoo en vivo (con caché
// corta). Precios devueltos con IVA; stock "libre" = cantidad − reservado en
// Odoo; las reservas de la app se descuentan en groupStock.
import { callKwReadWithRetry } from './feriaOdoo.mjs';
import { withIva, basePriceOf } from './posPricing.mjs';

const WEB_UNLIMITED_FROM = 100000;
const CACHE_MS = 60 * 1000;
const PRODUCT_FIELDS = ['id', 'name', 'default_code', 'lst_price', 'product_tmpl_id'];

// Precio sin IVA según los ítems de una lista de precios: el de la variante
// gana sobre el de la plantilla. Solo fijo o % sobre el precio de lista.
export function priceFromItems(product, items) {
  const tmplId = product.product_tmpl_id?.[0];
  const forVariant = items.find((i) => i.applied_on === '0_product_variant' && i.product_id?.[0] === product.id);
  const forTemplate = items.find((i) => i.applied_on === '1_product' && i.product_tmpl_id?.[0] === tmplId);
  const item = forVariant ?? forTemplate;
  if (!item) return null;
  if (item.compute_price === 'fixed') return item.fixed_price;
  if (item.compute_price === 'percentage') return Math.round(product.lst_price * (1 - item.percent_price / 100) * 100) / 100;
  return null;
}

export function freeByLocation(quants) {
  const result = new Map();
  for (const q of quants) {
    const productId = q.product_id[0];
    const locationId = q.location_id[0];
    if (!result.has(productId)) result.set(productId, new Map());
    const byLoc = result.get(productId);
    byLoc.set(locationId, (byLoc.get(locationId) ?? 0) + q.quantity - (q.reserved_quantity ?? 0));
  }
  return result;
}

export function groupStock({ freeByLoc, appReserved, locales, settings, localId }) {
  const free = (locationId) => Math.max(0, (freeByLoc.get(locationId) ?? 0) - (appReserved.get(locationId) ?? 0));
  const own = locales.find((l) => l.id === localId);
  const webRaw = freeByLoc.get(settings.web.locationId) ?? 0;
  return {
    local: own ? { stock: free(own.stockLocationId), exhibicion: free(own.exhibicionLocationId) } : null,
    rolon: free(settings.rolon.locationId),
    web: webRaw >= WEB_UNLIMITED_FROM ? { qty: null, unlimited: true } : { qty: Math.max(0, webRaw), unlimited: false },
    otros: locales
      .filter((l) => l.id !== localId)
      .map((l) => ({ localId: l.id, name: l.name, qty: free(l.stockLocationId) + free(l.exhibicionLocationId) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es')),
  };
}

export function stockLocationIds(locales, settings) {
  return [
    ...locales.flatMap((l) => [l.stockLocationId, l.exhibicionLocationId]),
    settings.rolon.locationId, settings.web.locationId,
  ];
}

async function pricelistItems(pricelistId, products) {
  if (!pricelistId || !products.length) return [];
  return callKwReadWithRetry('product.pricelist.item', 'search_read', [[
    ['pricelist_id', '=', pricelistId],
    '|', ['product_id', 'in', products.map((p) => p.id)], ['product_tmpl_id', 'in', products.map((p) => p.product_tmpl_id[0])],
  ]], { fields: ['applied_on', 'product_id', 'product_tmpl_id', 'compute_price', 'fixed_price', 'percent_price', 'date_start', 'date_end'] });
}

// Ítems vigentes hoy (date_start/date_end de Odoo: 'YYYY-MM-DD HH:mm:ss' UTC).
function currentItems(items, now = Date.now()) {
  const toMs = (s) => new Date(`${s.replace(' ', 'T')}Z`).getTime();
  return items.filter((i) => (!i.date_start || toMs(i.date_start) <= now) && (!i.date_end || toMs(i.date_end) >= now));
}

async function toCatalogProducts(rawProducts, settings) {
  const [fullItems, promoItems] = await Promise.all([
    pricelistItems(settings.fullPricelistId, rawProducts), pricelistItems(settings.promoPricelistId, rawProducts),
  ]);
  const full = currentItems(fullItems);
  const promo = currentItems(promoItems);
  return rawProducts.map((p) => {
    const fullNet = priceFromItems(p, full) ?? p.lst_price;
    const promoNet = priceFromItems(p, promo);
    const fullPrice = withIva(fullNet);
    const promoPrice = promoNet == null ? null : withIva(promoNet);
    return {
      productId: p.id, templateId: p.product_tmpl_id[0], sku: p.default_code ?? '', name: p.name,
      fullPrice, promoPrice, basePrice: basePriceOf({ fullPrice, promoPrice }),
    };
  });
}

const searchCache = new Map();

export async function searchCatalog(query, settings) {
  const q = String(query ?? '').trim();
  const key = q.toUpperCase();
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.products;
  const raw = await callKwReadWithRetry('product.product', 'search_read', [[
    ['sale_ok', '=', true], ['default_code', '!=', false],
    '|', ['default_code', 'ilike', q], ['name', 'ilike', q],
  ]], { fields: PRODUCT_FIELDS, limit: 30, order: 'default_code' });
  const products = await toCatalogProducts(raw, settings);
  searchCache.set(key, { at: Date.now(), products });
  if (searchCache.size > 500) searchCache.delete(searchCache.keys().next().value);
  return products;
}

export async function getCatalogProducts(productIds, settings) {
  const ids = [...new Set(productIds)];
  if (!ids.length) return new Map();
  const raw = await callKwReadWithRetry('product.product', 'read', [ids], { fields: PRODUCT_FIELDS });
  const products = await toCatalogProducts(raw, settings);
  return new Map(products.map((p) => [p.productId, p]));
}

export async function fetchFreeStock(productIds, locationIds) {
  const ids = [...new Set(productIds)];
  if (!ids.length) return new Map();
  const quants = await callKwReadWithRetry('stock.quant', 'search_read', [[
    ['product_id', 'in', ids], ['location_id', 'in', locationIds],
  ]], { fields: ['product_id', 'location_id', 'quantity', 'reserved_quantity'] });
  return freeByLocation(quants);
}
```

- [ ] **Step 4: Correr** — `node --test test/posCatalog.test.mjs` → PASS (5 tests).

- [ ] **Step 5: Prueba de lectura real (solo lectura)** — script en el scratchpad que importe `searchCatalog` y `fetchFreeStock` con `getSettings()` y busque "QUEENS" (el ejemplo del instructivo). Verificar a mano contra Odoo: precio full con IVA = `list_price × 1.21` y stock de `LL/Stock` igual al de Inventario → "A mano".

- [ ] **Step 6: Commit**

```bash
git add backend/posCatalog.mjs backend/test/posCatalog.test.mjs
git commit -m "feat(pos): búsqueda de productos, precios full/promo y stock por ubicación"
```

---

### Task 7: Líneas de pedido y reservas de stock

**Files:**
- Create: `Reportes/backend/posLines.mjs`, `Reportes/backend/posStock.mjs`
- Test: `Reportes/backend/test/posLines.test.mjs`, `Reportes/backend/test/posStock.test.mjs`

**Interfaces:**
- Consumes: `ORIGINS`, `originLocationId` (Task 3); `CatalogProduct` (Task 6); de `feriaLines.mjs` (sin modificarlo): `isConfirming`, `shouldAutoRetry`, `CONFIRMING_MESSAGE`, `CONFIRM_CLAIM_MS`.
- Produces (`posLines.mjs`, todo puro):
  - Línea: `{ lineId: 'L1', productId, sku, name, qty, fullPrice, promoPrice|null, basePrice, origin: 'stock'|'exhibicion'|'rolon', delivery, pickupLocalId|null, status: 'activo'|'entregado'|'eliminado', odooLineId? }`
  - `DELIVERIES = ['ahora','retira_local','envio','retira_rolon','retira_otro_local']`, `DELIVERY_LABELS`, `ORIGIN_LABELS`, `RESERVING_ORDER_STATUSES = Set(['carrito','pendiente','error'])`.
  - `validateLine(line, { localId, localeIds }) → string[]`
  - `buildLine(product, input, lines, ctx) → line` (tira si es inválida), `editLine(line, changes, ctx) → line`.
  - `nextLineId(lines)`, `activeLines(lines)`, `needsShipping(lines)`, `validateShipping(shipping) → string[]`.
  - `reservationKey(productId, locationId)`, `parseReservationKey(key) → { productId, locationId }`.
  - `reservationDeltas(before, after, locate) → Map<key, delta>` donde `before/after = { status, lines } | null` y `locate(origin) → locationId`.
  - `formatOrderNumber(localId, n) → 'LL-0001'`.
  - Re-exporta `isConfirming`, `shouldAutoRetry`, `CONFIRMING_MESSAGE`, `CONFIRM_CLAIM_MS`.
- Produces (`posStock.mjs`):
  - `RESERVATIONS_COLLECTION = 'pos_reservations'`.
  - `readReservations(db, keys, tx?) → Map<key, number>`.
  - `checkAvailability(freeStock, reserved, deltas, skuById) → string[]` (`freeStock` = salida de `fetchFreeStock`).
  - `writeReservations(tx, db, reserved, deltas)`.
  - `appReservedFor(reserved, productId) → Map<locationId, number>`.
  - `readReservationsFor(db, productIds, locationIds) → Map<key, number>`.

- [ ] **Step 1: Test de líneas**

```js
// test/posLines.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateLine, buildLine, editLine, reservationDeltas, reservationKey, formatOrderNumber, validateShipping, needsShipping,
} from '../posLines.mjs';

const ctx = { localId: 'LL', localeIds: ['LL', 'BL', 'AL'] };
const product = { productId: 10, sku: 'QUE001', name: 'Cajonera Queens', fullPrice: 1210, promoPrice: null, basePrice: 1210 };
const line = (over = {}) => ({ lineId: 'L1', productId: 10, sku: 'QUE001', qty: 1, origin: 'stock', delivery: 'ahora', pickupLocalId: null, status: 'activo', ...over });

test('validateLine: "se lo lleva ahora" solo desde el local', () => {
  assert.deepEqual(validateLine(line({ origin: 'exhibicion' }), ctx), []);
  assert.deepEqual(validateLine(line({ origin: 'rolon' }), ctx), ['QUE001: "Se lo lleva ahora" solo sale del local (Stock o Exhibición)']);
});

test('validateLine: retira en Rolón sale de Rolón; retira en otro local necesita otro local', () => {
  assert.deepEqual(validateLine(line({ origin: 'stock', delivery: 'retira_rolon' }), ctx), ['QUE001: "Retira en Rolón" sale de Rolón']);
  assert.deepEqual(validateLine(line({ origin: 'rolon', delivery: 'retira_otro_local', pickupLocalId: 'LL' }), ctx), ['QUE001: elegí en qué otro local retira']);
  assert.deepEqual(validateLine(line({ origin: 'rolon', delivery: 'retira_otro_local', pickupLocalId: 'AL' }), ctx), []);
});

test('validateLine: retira otro día en el local y envío aceptan cualquier origen', () => {
  for (const origin of ['stock', 'exhibicion', 'rolon']) {
    assert.deepEqual(validateLine(line({ origin, delivery: 'retira_local' }), ctx), []);
    assert.deepEqual(validateLine(line({ origin, delivery: 'envio' }), ctx), []);
  }
});

test('validateLine: cantidad entera positiva', () => {
  assert.deepEqual(validateLine(line({ qty: 0 }), ctx), ['QUE001: cantidad inválida']);
  assert.deepEqual(validateLine(line({ qty: 1.5 }), ctx), ['QUE001: cantidad inválida']);
});

test('buildLine: toma precios del catálogo y numera después de la mayor', () => {
  const built = buildLine(product, { qty: 2 }, [line({ lineId: 'L3' })], ctx);
  assert.equal(built.lineId, 'L4');
  assert.equal(built.basePrice, 1210);
  assert.equal(built.origin, 'stock');
  assert.equal(built.delivery, 'ahora');
  assert.equal(built.status, 'activo');
  assert.throws(() => buildLine(product, { origin: 'rolon', delivery: 'ahora' }, [], ctx), /solo sale del local/);
});

test('editLine: cambia origen/entrega/cantidad y revalida; no edita entregadas', () => {
  const edited = editLine(line(), { origin: 'rolon', delivery: 'envio', qty: 3 }, ctx);
  assert.equal(edited.origin, 'rolon');
  assert.equal(edited.qty, 3);
  assert.throws(() => editLine(line({ status: 'entregado' }), { qty: 2 }, ctx), /ya se entregó/);
});

test('reservationDeltas: el carrito reserva; confirmar libera (Odoo pasa a reservar)', () => {
  const locate = (origin) => ({ stock: 8, exhibicion: 324, rolon: 174 }[origin]);
  const lines = [line({ qty: 2 }), line({ lineId: 'L2', origin: 'rolon', delivery: 'envio' })];
  const created = reservationDeltas(null, { status: 'carrito', lines }, locate);
  assert.deepEqual([...created], [[reservationKey(10, 8), 2], [reservationKey(10, 174), 1]]);
  const confirmed = reservationDeltas({ status: 'pendiente', lines }, { status: 'confirmado', lines }, locate);
  assert.deepEqual([...confirmed], [[reservationKey(10, 8), -2], [reservationKey(10, 174), -1]]);
});

test('reservationDeltas: mover de origen devuelve en uno y toma en el otro; sin cambios → vacío', () => {
  const locate = (origin) => ({ stock: 8, exhibicion: 324, rolon: 174 }[origin]);
  const before = { status: 'pendiente', lines: [line()] };
  const after = { status: 'pendiente', lines: [line({ origin: 'exhibicion' })] };
  assert.deepEqual([...reservationDeltas(before, after, locate)], [[reservationKey(10, 8), -1], [reservationKey(10, 324), 1]]);
  assert.equal(reservationDeltas(before, before, locate).size, 0);
});

test('formatOrderNumber y envío', () => {
  assert.equal(formatOrderNumber('LL', 12), 'LL-0012');
  assert.equal(needsShipping([line({ delivery: 'envio' })]), true);
  assert.equal(needsShipping([line({ delivery: 'envio', status: 'eliminado' })]), false);
  assert.deepEqual(validateShipping({ street: 'Av. X', number: '1', city: 'CABA', zip: '1428', phone: '1155556666', amount: -1 }), ['Costo de envío inválido']);
  assert.deepEqual(validateShipping({ amount: 0 }).length, 5);
});
```

- [ ] **Step 2: Correr y ver que falla** — `node --test test/posLines.test.mjs` → FAIL.

- [ ] **Step 3: Implementar `posLines.mjs`**

```js
// Modelo de línea del POS: de dónde sale (origen) y cómo se entrega. Todo
// puro; la E/S vive en posOrders / posStock / posOdoo.
import { ORIGINS } from './posConfig.mjs';
export { isConfirming, shouldAutoRetry, CONFIRMING_MESSAGE, CONFIRM_CLAIM_MS } from './feriaLines.mjs';

export const DELIVERIES = ['ahora', 'retira_local', 'envio', 'retira_rolon', 'retira_otro_local'];
export const DELIVERY_LABELS = {
  ahora: 'Se lo lleva ahora', retira_local: 'Retira otro día en el local', envio: 'Envío a domicilio',
  retira_rolon: 'Retira en Rolón', retira_otro_local: 'Retira en otro local',
};
export const ORIGIN_LABELS = { stock: 'Stock del local', exhibicion: 'Exhibición', rolon: 'Rolón' };
// Mientras el pedido está en estos estados la app reserva su stock. Al
// confirmar, la reserva pasa a Odoo (remito reservado) y la de la app se libera.
export const RESERVING_ORDER_STATUSES = new Set(['carrito', 'pendiente', 'error']);

export function validateLine(line, { localId, localeIds }) {
  const errors = [];
  const sku = line.sku ?? 'un producto';
  if (!Number.isInteger(line.qty) || line.qty < 1) errors.push(`${sku}: cantidad inválida`);
  if (!ORIGINS.includes(line.origin)) errors.push(`${sku}: origen inválido`);
  if (!DELIVERIES.includes(line.delivery)) errors.push(`${sku}: forma de entrega inválida`);
  if (errors.length) return errors;
  if (line.delivery === 'ahora' && line.origin === 'rolon') {
    errors.push(`${sku}: "Se lo lleva ahora" solo sale del local (Stock o Exhibición)`);
  }
  if (line.delivery === 'retira_rolon' && line.origin !== 'rolon') errors.push(`${sku}: "Retira en Rolón" sale de Rolón`);
  if (line.delivery === 'retira_otro_local') {
    if (line.origin !== 'rolon') errors.push(`${sku}: "Retira en otro local" sale de Rolón`);
    if (!localeIds.includes(line.pickupLocalId) || line.pickupLocalId === localId) errors.push(`${sku}: elegí en qué otro local retira`);
  }
  return errors;
}

export function nextLineId(lines) {
  const max = lines.reduce((m, l) => Math.max(m, Number(String(l.lineId ?? '').replace('L', '')) || 0), 0);
  return `L${max + 1}`;
}

export const activeLines = (lines) => (lines ?? []).filter((l) => l.status !== 'eliminado');

export function buildLine(product, { qty = 1, origin = 'stock', delivery = 'ahora', pickupLocalId = null }, lines, ctx) {
  const line = {
    lineId: nextLineId(lines), productId: product.productId, sku: product.sku, name: product.name, qty,
    fullPrice: product.fullPrice, promoPrice: product.promoPrice, basePrice: product.basePrice,
    origin, delivery, pickupLocalId: delivery === 'retira_otro_local' ? pickupLocalId : null, status: 'activo',
  };
  const errors = validateLine(line, ctx);
  if (errors.length) throw new Error(errors.join('; '));
  return line;
}

export function editLine(line, changes, ctx) {
  if (line.status === 'entregado') throw new Error(`${line.sku} ya se entregó: no se puede cambiar`);
  if (line.status === 'eliminado') throw new Error(`${line.sku} está eliminada`);
  const next = { ...line };
  for (const field of ['qty', 'origin', 'delivery', 'pickupLocalId']) {
    if (changes[field] !== undefined) next[field] = changes[field];
  }
  if (next.delivery !== 'retira_otro_local') next.pickupLocalId = null;
  const errors = validateLine(next, ctx);
  if (errors.length) throw new Error(errors.join('; '));
  return next;
}

export function needsShipping(lines) {
  return activeLines(lines).some((l) => l.delivery === 'envio');
}

const SHIPPING_REQUIRED = { street: 'la calle', number: 'el número', city: 'la localidad', zip: 'el código postal', phone: 'el teléfono' };

export function validateShipping(shipping) {
  const errors = Object.entries(SHIPPING_REQUIRED)
    .filter(([field]) => typeof shipping?.[field] !== 'string' || !shipping[field].trim())
    .map(([, label]) => `Falta ${label} del envío`);
  const amount = shipping?.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) errors.push('Costo de envío inválido');
  return errors;
}

export const reservationKey = (productId, locationId) => `${productId}__${locationId}`;

export function parseReservationKey(key) {
  const [productId, locationId] = key.split('__').map(Number);
  return { productId, locationId };
}

function addDeltas(deltas, state, sign, locate) {
  if (!state || !RESERVING_ORDER_STATUSES.has(state.status)) return;
  for (const line of state.lines ?? []) {
    if (line.status !== 'activo') continue;
    const key = reservationKey(line.productId, locate(line.origin));
    deltas.set(key, (deltas.get(key) ?? 0) + sign * line.qty);
  }
}

export function reservationDeltas(before, after, locate) {
  const deltas = new Map();
  addDeltas(deltas, before, -1, locate);
  addDeltas(deltas, after, +1, locate);
  for (const [key, value] of deltas) if (value === 0) deltas.delete(key);
  return deltas;
}

export const formatOrderNumber = (localId, n) => `${localId}-${String(n).padStart(4, '0')}`;
```

- [ ] **Step 4: Correr** — `node --test test/posLines.test.mjs` → PASS (9 tests).

- [ ] **Step 5: Test de reservas** (incluye Review Focus #1: la última unidad no se reserva dos veces)

```js
// test/posStock.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAvailability, appReservedFor } from '../posStock.mjs';
import { reservationKey } from '../posLines.mjs';

const skuById = new Map([[10, 'QUE001']]);
const freeStock = new Map([[10, new Map([[324, 1], [8, 0]])]]);

test('checkAvailability: la última unidad de exhibición la toma uno solo', () => {
  const deltas = new Map([[reservationKey(10, 324), 1]]);
  assert.deepEqual(checkAvailability(freeStock, new Map(), deltas, skuById), []);
  const yaReservada = new Map([[reservationKey(10, 324), 1]]);
  assert.deepEqual(checkAvailability(freeStock, yaReservada, deltas, skuById), ['QUE001: pediste 1 y quedan 0 en esa ubicación']);
});

test('checkAvailability: liberar nunca se bloquea', () => {
  const deltas = new Map([[reservationKey(10, 8), -3]]);
  assert.deepEqual(checkAvailability(freeStock, new Map(), deltas, skuById), []);
});

test('appReservedFor: reservas de la app de un producto por ubicación', () => {
  const reserved = new Map([[reservationKey(10, 8), 2], [reservationKey(11, 8), 5], [reservationKey(10, 174), 1]]);
  assert.deepEqual([...appReservedFor(reserved, 10)], [[8, 2], [174, 1]]);
});
```

- [ ] **Step 6: Correr y ver que falla** — `node --test test/posStock.test.mjs` → FAIL.

- [ ] **Step 7: Implementar `posStock.mjs`**

```js
// Reservas de la app (pos_reservations/{productId}__{locationId}). El
// disponible real es el libre de Odoo menos lo reservado acá. Leer y escribir
// siempre dentro de la misma transacción: dos vendedores no se pisan.
import { parseReservationKey, reservationKey } from './posLines.mjs';

export const RESERVATIONS_COLLECTION = 'pos_reservations';

export async function readReservations(db, keys, tx = null) {
  const result = new Map();
  if (!keys.length) return result;
  const refs = keys.map((key) => db.collection(RESERVATIONS_COLLECTION).doc(key));
  const snaps = tx ? await tx.getAll(...refs) : await db.getAll(...refs);
  snaps.forEach((snap, i) => result.set(keys[i], snap.exists ? (snap.data().reserved ?? 0) : 0));
  return result;
}

export function checkAvailability(freeStock, reserved, deltas, skuById) {
  const errors = [];
  for (const [key, delta] of deltas) {
    if (delta <= 0) continue;
    const { productId, locationId } = parseReservationKey(key);
    const free = freeStock.get(productId)?.get(locationId) ?? 0;
    const available = Math.max(0, free - (reserved.get(key) ?? 0));
    if (delta > available) errors.push(`${skuById.get(productId) ?? productId}: pediste ${delta} y quedan ${available} en esa ubicación`);
  }
  return errors;
}

export function writeReservations(tx, db, reserved, deltas) {
  for (const [key, delta] of deltas) {
    const { productId, locationId } = parseReservationKey(key);
    const value = Math.max(0, (reserved.get(key) ?? 0) + delta);
    tx.set(db.collection(RESERVATIONS_COLLECTION).doc(key), { productId, locationId, reserved: value, updatedAt: new Date() });
  }
}

export function appReservedFor(reserved, productId) {
  const result = new Map();
  for (const [key, value] of reserved) {
    const parsed = parseReservationKey(key);
    if (parsed.productId === productId && value) result.set(parsed.locationId, value);
  }
  return result;
}

export function readReservationsFor(db, productIds, locationIds) {
  const keys = productIds.flatMap((p) => locationIds.map((l) => reservationKey(p, l)));
  return readReservations(db, keys);
}
```

- [ ] **Step 8: Correr ambos** — `node --test test/posLines.test.mjs test/posStock.test.mjs` → PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/posLines.mjs backend/posStock.mjs backend/test/posLines.test.mjs backend/test/posStock.test.mjs
git commit -m "feat(pos): líneas con origen y entrega, y reservas de stock"
```

---

### Task 8: Pedidos — carrito, envío a caja, edición en caja y reclamo

**Files:**
- Create: `Reportes/backend/posOrders.mjs`
- Test: `Reportes/backend/test/posOrders.test.mjs`

**Interfaces:**
- Consumes: Tasks 3–7 (`getLocale`, `getLocales`, `getSettings`, `getPaymentMethodsById`, `originLocationId`, `localeIdsOf`, `computeTotals`, `resolveExtraDiscount`, `listActivePromotions`, `getCatalogProducts`, `fetchFreeStock`, `stockLocationIds`, línea y reservas).
- Produces:
  - Pedido (`pos_orders/{id}`): `{ localId, number, sellerId, sellerName, status: 'carrito'|'pendiente'|'error'|'confirmado'|'anulado'|'descartado', lines, customer|null, shipping|null, payments: [{ methodId, detailId|null, amount|null }], discountChoice: { code|null, promotionId|null }|null, extraDiscount|null, totals|null, wantsInvoice, notes, queueKey, monthKey, createdAt, updatedAt, sentAt?, cashSessionId?, confirmingSince?, odooOrderId?, odooOrderName?, odooLineIds?, invoiceId?, invoiceName?, invoiceError?, errorDetail?, warning?, autoRetryCount?, lastAutoRetryAt?, confirmedAt?, confirmedBy?, annulledAt?, annulledBy? }`.
  - Cliente: `{ docNumber, name, phone, email, street, city, zip, afipResponsibility: 'responsable_inscripto'|'monotributo'|'exento'|'consumidor_final'|null, fromArca: boolean, odooPartnerId|null, tagIds: number[] }`.
  - Puras: `orderKeys({ localId, status, createdAt }) → { queueKey, monthKey }`, `validateCustomer(customer, { wantsInvoice }) → string[]`, `validatePayments(payments, methodsById) → payments`, `assertPaymentsMatchTotal(payments, total)`, `priceOrder(order, { methodsById, promotions, now }) → { extraDiscount, totals }`, `assertCartEditable(order, user)`, `assertDraftEditable(order)`, `CASH_CLOSED_MESSAGE`.
  - E/S: `createCart(user, lineInput)`, `addCartLine(id, user, lineInput)`, `updateLine(id, user, lineId, changes)`, `removeLine(id, user, lineId)`, `discardCart(id, user)`, `listMyCarts(user)`, `submitCart(id, user, { customer, shipping })`, `listQueue(localId)`, `getOrder(id)`, `updateDraft(id, user, patch)`, `claimOrderForConfirm(id, user) → { order, alreadyConfirmed }`, `saveOdooOrderId`, `saveOdooLineIds`, `markOrderConfirmed`, `markOrderError`, `setOrderWarning`, `markOrderInvoiced`, `setInvoiceError`, `markLinesDelivered`, `markOrderAnnulled`, `recordAutoRetry`, `listOrdersByMonth(localIds, months)`, `cashPointerRef(db, localId)`.
  - `user` en todas = `req.posUser` (`{ id, name, role, localId }`). Para admin operando un local, la ruta arma `{ ...req.posUser, localId: scopeLocalId(...) }`.

- [ ] **Step 1: Test de la lógica pura** (incluye Review Focus #2)

```js
// test/posOrders.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  orderKeys, validateCustomer, validatePayments, assertPaymentsMatchTotal, priceOrder, assertCartEditable, assertDraftEditable,
} from '../posOrders.mjs';

const methodsById = new Map([
  ['efectivo', { id: 'efectivo', label: 'Efectivo', discountPct: 15, details: [] }],
  ['credito', { id: 'credito', label: 'Tarjeta crédito', discountPct: 0, details: [{ id: '6', label: '6 cuotas', odooName: 'MP 6' }] }],
]);
const customer = { docNumber: '30123456', name: 'Ana Pérez', phone: '11 5555 6666', email: 'ana@mail.com', afipResponsibility: null };

test('orderKeys: claves para consultar sin índices compuestos', () => {
  const keys = orderKeys({ localId: 'LL', status: 'pendiente', createdAt: new Date('2026-10-13T12:00:00-03:00') });
  assert.deepEqual(keys, { queueKey: 'LL_pendiente', monthKey: 'LL_2026-10' });
});

test('validateCustomer: obligatorios y email/teléfono válidos', () => {
  assert.deepEqual(validateCustomer(customer, { wantsInvoice: false }), []);
  const errors = validateCustomer({ ...customer, phone: '123', email: 'x' }, { wantsInvoice: false });
  assert.deepEqual(errors, ['Teléfono inválido: tiene que tener al menos 8 números', 'Email inválido']);
});

test('validateCustomer: Factura A pide CUIT válido y condición de IVA', () => {
  const ri = { ...customer, docNumber: '30-71234567-1', afipResponsibility: null };
  assert.ok(validateCustomer(ri, { wantsInvoice: true }).includes('Para facturar a un CUIT falta la condición de IVA (buscalo en ARCA)'));
});

test('validatePayments: medios válidos, detalle obligatorio en crédito, montos en pago dividido', () => {
  assert.deepEqual(validatePayments([{ methodId: 'efectivo' }], methodsById), [{ methodId: 'efectivo', detailId: null, amount: null }]);
  assert.throws(() => validatePayments([{ methodId: 'credito' }], methodsById), /Elegí el detalle/);
  assert.throws(() => validatePayments([{ methodId: 'efectivo', amount: 10 }, { methodId: 'credito', detailId: '6' }], methodsById), /Monto inválido/);
  assert.throws(() => validatePayments([{ methodId: 'efectivo', amount: 1 }, { methodId: 'efectivo', amount: 1 }], methodsById), /repetido/);
});

test('assertPaymentsMatchTotal: si caja cambió algo después de dividir, frena', () => {
  const payments = [{ methodId: 'efectivo', amount: 500 }, { methodId: 'credito', detailId: '6', amount: 500 }];
  assert.doesNotThrow(() => assertPaymentsMatchTotal(payments, 1000));
  assert.throws(() => assertPaymentsMatchTotal(payments, 1210), /suman \$ 1\.000 y el total es \$ 1\.210/);
  assert.doesNotThrow(() => assertPaymentsMatchTotal([{ methodId: 'efectivo', amount: null }], 1210));
});

test('priceOrder: aplica la cascada con el descuento elegido', () => {
  const order = {
    lines: [{ qty: 1, basePrice: 100000, status: 'activo' }], payments: [{ methodId: 'efectivo' }],
    discountChoice: null, shipping: null, customer: { tagIds: [] },
  };
  const { totals, extraDiscount } = priceOrder(order, { methodsById, promotions: [], now: Date.now() });
  assert.equal(extraDiscount, null);
  assert.equal(totals.total, 85000);
});

test('assertCartEditable / assertDraftEditable', () => {
  assert.throws(() => assertCartEditable({ status: 'carrito', sellerId: 'a' }, { id: 'b' }), /otro vendedor/);
  assert.throws(() => assertCartEditable({ status: 'pendiente', sellerId: 'a', number: 'LL-0001' }, { id: 'a' }), /ya se mandó/);
  assert.throws(() => assertDraftEditable({ status: 'confirmado' }), /ya se confirmó/);
  assert.throws(() => assertDraftEditable({ status: 'error', odooOrderId: 5 }), /ya existe en Odoo/);
  assert.doesNotThrow(() => assertDraftEditable({ status: 'pendiente' }));
});
```

- [ ] **Step 2: Correr y ver que falla** — `node --test test/posOrders.test.mjs` → FAIL.

- [ ] **Step 3: Implementar `posOrders.mjs`**

```js
// Pedidos del POS. El vendedor arma un carrito (ya numerado y reservando
// stock) y lo manda a caja; caja lo completa (pago, descuento, factura) y lo
// confirma. Queries de un solo campo: queueKey (local+estado) y monthKey
// (local+mes), sin índices compuestos.
import { getDb } from './firestore.mjs';
import {
  getLocale, getLocales, getSettings, getPaymentMethodsById, originLocationId, localeIdsOf, resolveOdooPaymentName,
} from './posConfig.mjs';
import { computeTotals, round2 } from './posPricing.mjs';
import { resolveExtraDiscount, listActivePromotions } from './posPromotions.mjs';
import { getCatalogProducts, fetchFreeStock, stockLocationIds } from './posCatalog.mjs';
import {
  buildLine, editLine, reservationDeltas, needsShipping, validateShipping, formatOrderNumber, isConfirming,
  CONFIRMING_MESSAGE, activeLines, RESERVING_ORDER_STATUSES,
} from './posLines.mjs';
import { readReservations, checkAvailability, writeReservations } from './posStock.mjs';
import { isValidCuit } from './feriaOdoo.mjs';

export const COLLECTION = 'pos_orders';
const COUNTERS = 'pos_counters';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const CASH_CLOSED_MESSAGE = 'La caja del local está cerrada: abrila en "Caja del día" para confirmar ventas';
const ALREADY_IN_ODOO = 'El pedido ya existe en Odoo: reintentá confirmar o resolvelo en Odoo';

const pesos = (n) => `$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
const toDate = (v) => (v?.toDate ? v.toDate() : new Date(v));

// Mes en hora de Argentina (UTC-3, sin horario de verano).
function argMonth(date) {
  const d = new Date(toDate(date).getTime() - 3 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function orderKeys({ localId, status, createdAt }) {
  return { queueKey: `${localId}_${status}`, monthKey: `${localId}_${argMonth(createdAt)}` };
}

export function validateCustomer(c, { wantsInvoice }) {
  const errors = [];
  if (!c?.name?.trim()) errors.push('Falta el nombre del cliente');
  const digits = String(c?.docNumber ?? '').replace(/\D/g, '');
  if (!digits) errors.push('Falta el DNI/CUIT del cliente');
  const phone = String(c?.phone ?? '').replace(/\D/g, '');
  if (!phone) errors.push('Falta el teléfono del cliente');
  else if (phone.length < 8) errors.push('Teléfono inválido: tiene que tener al menos 8 números');
  const email = c?.email?.trim() ?? '';
  if (!email) errors.push('Falta el email del cliente');
  else if (!EMAIL_PATTERN.test(email)) errors.push('Email inválido');
  if (wantsInvoice && digits.length === 11) {
    if (!isValidCuit(digits)) errors.push('El CUIT no es válido');
    else if (!c.afipResponsibility) errors.push('Para facturar a un CUIT falta la condición de IVA (buscalo en ARCA)');
  }
  return errors;
}

export function validatePayments(payments, methodsById) {
  if (!Array.isArray(payments) || !payments.length) throw new Error('Cargá al menos un medio de pago');
  const seen = new Set();
  return payments.map(({ methodId, detailId = null, amount = null }) => {
    const method = methodsById.get(methodId);
    if (!method || method.active === false) throw new Error(`Medio de pago inválido: ${methodId}`);
    resolveOdooPaymentName(method, detailId); // tira si falta el detalle (cuotas)
    const key = `${methodId}:${detailId ?? ''}`;
    if (seen.has(key)) throw new Error(`${method.label} está repetido: sumá los montos en uno solo`);
    seen.add(key);
    if (payments.length === 1) return { methodId, detailId, amount: null };
    const n = typeof amount === 'string' && amount.trim() !== '' ? Number(amount) : amount;
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) throw new Error(`Monto inválido para ${method.label}`);
    return { methodId, detailId, amount: round2(n) };
  });
}

export function assertPaymentsMatchTotal(payments, total) {
  if (payments.length < 2) return;
  const paid = round2(payments.reduce((sum, p) => sum + p.amount, 0));
  if (Math.abs(paid - total) >= 0.01) {
    throw new Error(`Los pagos suman ${pesos(paid)} y el total es ${pesos(total)}: corregí los montos del pago dividido`);
  }
}

export function priceOrder(order, { methodsById, promotions, now }) {
  const ctx = {
    paymentMethodIds: (order.payments ?? []).map((p) => p.methodId),
    customerTagIds: order.customer?.tagIds ?? [],
    now,
  };
  const extraDiscount = resolveExtraDiscount(promotions, order.discountChoice ?? {}, ctx);
  const totals = computeTotals({
    lines: order.lines, payments: order.payments ?? [], methodsById, extraDiscount,
    shippingAmount: needsShipping(order.lines) ? (order.shipping?.amount ?? 0) : 0,
  });
  return { extraDiscount, totals };
}

export function assertCartEditable(order, user) {
  if (order.sellerId !== user.id) throw new Error('Este carrito es de otro vendedor');
  if (order.status === 'descartado') throw new Error('Este carrito se vació');
  if (order.status !== 'carrito') throw new Error(`El pedido ${order.number} ya se mandó a caja`);
}

export function assertDraftEditable(order) {
  if (!['pendiente', 'error'].includes(order.status)) throw new Error('La venta ya se confirmó: no se puede cambiar desde acá');
  if (order.odooOrderId) throw new Error(ALREADY_IN_ODOO);
  if (isConfirming(order)) throw new Error(CONFIRMING_MESSAGE);
}

// ---- Firestore ----

const withId = (snap) => ({ id: snap.id, ...snap.data() });
const counterRef = (db, localId) => db.collection(COUNTERS).doc(`orders_${localId}`);
export const cashPointerRef = (db, localId) => db.collection(COUNTERS).doc(`cash_${localId}`);

async function lineCtx(localId) {
  const [locale, locales, settings] = await Promise.all([getLocale(localId), getLocales(), getSettings()]);
  return {
    locale, settings, locales,
    validation: { localId, localeIds: localeIdsOf(locales) },
    locate: (origin) => originLocationId(locale, settings, origin),
  };
}

// Stock libre de Odoo de los productos tocados (HTTP lento: afuera de la
// transacción; las reservas se leen adentro).
async function stockFor(lines, ctx) {
  return fetchFreeStock(lines.map((l) => l.productId), stockLocationIds(ctx.locales, ctx.settings));
}

async function reserveInTx(tx, db, ctx, freeStock, before, after) {
  const deltas = reservationDeltas(before, after, ctx.locate);
  const reserved = await readReservations(db, [...deltas.keys()], tx);
  const skuById = new Map([...(before?.lines ?? []), ...(after?.lines ?? [])].map((l) => [l.productId, l.sku]));
  const errors = checkAvailability(freeStock, reserved, deltas, skuById);
  if (errors.length) throw new Error(`Sin stock suficiente — ${errors.join('; ')}`);
  return () => writeReservations(tx, db, reserved, deltas);
}

async function productFor(productId, ctx) {
  const product = (await getCatalogProducts([productId], ctx.settings)).get(productId);
  if (!product) throw new Error('Producto no encontrado en Odoo');
  return product;
}

export async function createCart(user, lineInput) {
  const ctx = await lineCtx(user.localId);
  const line = buildLine(await productFor(lineInput.productId, ctx), lineInput, [], ctx.validation);
  const freeStock = await stockFor([line], ctx);
  const db = getDb();
  const ref = db.collection(COLLECTION).doc();
  const now = new Date();
  const order = {
    localId: user.localId, sellerId: user.id, sellerName: user.name, status: 'carrito', lines: [line],
    customer: null, shipping: null, payments: [], discountChoice: null, extraDiscount: null, totals: null,
    wantsInvoice: false, notes: '', createdAt: now, updatedAt: now,
  };
  Object.assign(order, orderKeys(order));
  await db.runTransaction(async (tx) => {
    const counter = await tx.get(counterRef(db, user.localId));
    const commit = await reserveInTx(tx, db, ctx, freeStock, null, order);
    const next = (counter.exists ? counter.data().next : 0) + 1;
    order.number = formatOrderNumber(user.localId, next);
    commit();
    tx.set(counterRef(db, user.localId), { next });
    tx.set(ref, order);
  });
  return { id: ref.id, ...order };
}

// Cambia líneas de un carrito (vendedor/caja dueño) o de un pedido en caja
// (pendiente/error) y ajusta las reservas en la misma transacción.
async function changeLines(orderId, user, change, touched = []) {
  const db = getDb();
  const ref = db.collection(COLLECTION).doc(orderId);
  const first = withId(await ref.get());
  const ctx = await lineCtx(first.localId);
  const freeStock = touched.length ? await stockFor(touched, ctx) : new Map();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('Pedido no encontrado');
    const order = withId(snap);
    if (order.status === 'carrito') assertCartEditable(order, user);
    else assertDraftEditable(order);
    let lines = change(order.lines, ctx);
    // En carrito la línea sacada desaparece; en caja queda 'eliminado'.
    if (order.status === 'carrito') lines = lines.filter((l) => l.status !== 'eliminado');
    const commit = await reserveInTx(tx, db, ctx, freeStock, order, { ...order, lines });
    commit();
    const update = { lines, updatedAt: new Date() };
    tx.update(ref, update);
    return { ...order, ...update };
  });
}

export async function addCartLine(orderId, user, lineInput) {
  const order = await getOrder(orderId);
  const ctx = await lineCtx(order.localId);
  const product = await productFor(lineInput.productId, ctx);
  const probe = buildLine(product, lineInput, [], ctx.validation);
  return changeLines(orderId, user, (lines, c) => [...lines, buildLine(product, lineInput, lines, c.validation)], [probe]);
}

export async function updateLine(orderId, user, lineId, changes) {
  const order = await getOrder(orderId);
  const current = order.lines.find((l) => l.lineId === lineId);
  if (!current) throw new Error('Línea no encontrada');
  return changeLines(orderId, user, (lines, c) => lines.map((l) => (l.lineId === lineId ? editLine(l, changes, c.validation) : l)), [current]);
}

// Marca la línea como eliminada (changeLines la saca del todo si es carrito).
export function removeLine(orderId, user, lineId) {
  return changeLines(orderId, user, (lines) => {
    const target = lines.find((l) => l.lineId === lineId && l.status === 'activo');
    if (!target) throw new Error('Línea no encontrada');
    if (!lines.some((l) => l.lineId !== lineId && l.status === 'activo')) {
      throw new Error('No se puede sacar la última línea: vaciá el carrito o anulá el pedido');
    }
    return lines.map((l) => (l.lineId === lineId ? { ...l, status: 'eliminado' } : l));
  });
}

export async function discardCart(orderId, user) {
  const db = getDb();
  const ref = db.collection(COLLECTION).doc(orderId);
  const ctx = await lineCtx((await getOrder(orderId)).localId);
  return db.runTransaction(async (tx) => {
    const order = withId(await tx.get(ref));
    assertCartEditable(order, user);
    const after = { ...order, status: 'descartado' };
    const commit = await reserveInTx(tx, db, ctx, new Map(), order, after);
    commit();
    const update = { status: 'descartado', ...orderKeys(after), discardedAt: new Date(), updatedAt: new Date() };
    tx.update(ref, update);
    return { ...order, ...update };
  });
}

export async function listMyCarts(user) {
  const snap = await getDb().collection(COLLECTION).where('sellerId', '==', user.id).get();
  return snap.docs.map(withId).filter((o) => o.status === 'carrito')
    .sort((a, b) => toDate(a.createdAt) - toDate(b.createdAt));
}

const cleanCustomer = (c) => ({
  docNumber: String(c.docNumber).replace(/\D/g, ''), name: c.name.trim(), phone: c.phone.trim(), email: c.email.trim(),
  street: c.street?.trim() || '', city: c.city?.trim() || '', zip: c.zip?.trim() || '',
  afipResponsibility: c.afipResponsibility ?? null, fromArca: Boolean(c.fromArca),
  odooPartnerId: c.odooPartnerId ?? null, tagIds: Array.isArray(c.tagIds) ? c.tagIds.map(Number) : [],
});

export async function submitCart(orderId, user, { customer, shipping }) {
  const db = getDb();
  const ref = db.collection(COLLECTION).doc(orderId);
  return db.runTransaction(async (tx) => {
    const order = withId(await tx.get(ref));
    assertCartEditable(order, user);
    const errors = validateCustomer(customer, { wantsInvoice: false });
    const withShipping = needsShipping(order.lines);
    if (withShipping) errors.push(...validateShipping(shipping));
    if (errors.length) throw new Error(errors.join('; '));
    const next = {
      status: 'pendiente', customer: cleanCustomer(customer), shipping: withShipping ? shipping : null,
      sentAt: new Date(), updatedAt: new Date(),
    };
    Object.assign(next, orderKeys({ ...order, ...next }));
    tx.update(ref, next);
    return { ...order, ...next };
  });
}

export async function getOrder(id) {
  const snap = await getDb().collection(COLLECTION).doc(id).get();
  if (!snap.exists) throw new Error('Pedido no encontrado');
  return withId(snap);
}

export async function listQueue(localId) {
  const snap = await getDb().collection(COLLECTION)
    .where('queueKey', 'in', [`${localId}_pendiente`, `${localId}_error`]).get();
  return snap.docs.map(withId).sort((a, b) => toDate(a.sentAt ?? a.createdAt) - toDate(b.sentAt ?? b.createdAt));
}

// Caja completa el pedido antes de confirmar. `patch` puede traer:
// customer, shipping, payments, discountChoice, wantsInvoice, notes.
export async function updateDraft(orderId, user, patch) {
  const methodsById = await getPaymentMethodsById();
  const db = getDb();
  const ref = db.collection(COLLECTION).doc(orderId);
  return db.runTransaction(async (tx) => {
    const order = withId(await tx.get(ref));
    if (order.localId !== user.localId) throw Object.assign(new Error('No tenés acceso a ese local'), { status: 403 });
    if (patch.notes !== undefined && Object.keys(patch).length === 1 && order.status === 'confirmado') {
      const update = { notes: String(patch.notes).slice(0, 1000), updatedAt: new Date() };
      tx.update(ref, update);
      return { ...order, ...update };
    }
    assertDraftEditable(order);
    const update = { updatedAt: new Date() };
    if (patch.customer !== undefined) update.customer = cleanCustomer(patch.customer);
    if (patch.shipping !== undefined) update.shipping = patch.shipping;
    if (patch.payments !== undefined) update.payments = validatePayments(patch.payments, methodsById);
    if (patch.discountChoice !== undefined) update.discountChoice = patch.discountChoice;
    if (patch.wantsInvoice !== undefined) update.wantsInvoice = Boolean(patch.wantsInvoice);
    if (patch.notes !== undefined) update.notes = String(patch.notes).slice(0, 1000);
    tx.update(ref, update);
    return { ...order, ...update };
  });
}

// Reclama el pedido para confirmarlo: valida todo, fija precios y totales, y
// lo ata a la caja abierta del local. Si ya está confirmado, lo devuelve.
export async function claimOrderForConfirm(orderId, user) {
  const [methodsById, promotions] = await Promise.all([getPaymentMethodsById(), listActivePromotions()]);
  const db = getDb();
  const ref = db.collection(COLLECTION).doc(orderId);
  return db.runTransaction(async (tx) => {
    const order = withId(await tx.get(ref));
    if (order.localId !== user.localId) throw Object.assign(new Error('No tenés acceso a ese local'), { status: 403 });
    if (order.status === 'confirmado') return { order, alreadyConfirmed: true };
    if (!['pendiente', 'error'].includes(order.status)) throw new Error('Este pedido no se puede confirmar');
    if (isConfirming(order)) throw new Error(CONFIRMING_MESSAGE);
    const pointer = await tx.get(cashPointerRef(db, order.localId));
    const cashSessionId = pointer.data()?.openSessionId;
    if (!cashSessionId) throw new Error(CASH_CLOSED_MESSAGE);
    const errors = validateCustomer(order.customer, { wantsInvoice: order.wantsInvoice });
    if (needsShipping(order.lines)) errors.push(...validateShipping(order.shipping));
    if (!activeLines(order.lines).length) errors.push('El pedido no tiene productos');
    if (errors.length) throw new Error(errors.join('; '));
    const payments = validatePayments(order.payments, methodsById);
    const { extraDiscount, totals } = priceOrder({ ...order, payments }, { methodsById, promotions, now: Date.now() });
    assertPaymentsMatchTotal(payments, totals.total);
    const update = { confirmingSince: new Date(), cashSessionId, payments, extraDiscount, totals, updatedAt: new Date() };
    tx.update(ref, update);
    return { order: { ...order, ...update }, alreadyConfirmed: false };
  });
}

async function patchOrder(id, update) {
  await getDb().collection(COLLECTION).doc(id).update({ ...update, updatedAt: new Date() });
}

export const saveOdooOrderId = (id, odooOrderId) => patchOrder(id, { odooOrderId });
export const saveOdooLineIds = (id, lines) => patchOrder(id, { lines });
export const setOrderWarning = (id, warning) => patchOrder(id, { warning });
export const markOrderInvoiced = (id, { invoiceId, invoiceName }) => patchOrder(id, { invoiceId, invoiceName, invoiceError: null });
export const setInvoiceError = (id, invoiceError) => patchOrder(id, { invoiceError });

export async function markOrderError(id, errorDetail) {
  const order = await getOrder(id);
  await patchOrder(id, { status: 'error', errorDetail, confirmingSince: null, ...orderKeys({ ...order, status: 'error' }) });
}

// Confirmado en Odoo: la reserva pasa a Odoo y la de la app se libera.
export async function markOrderConfirmed(id, { odooOrderId, odooOrderName, user }) {
  const db = getDb();
  const ref = db.collection(COLLECTION).doc(id);
  const ctx = await lineCtx((await getOrder(id)).localId);
  return db.runTransaction(async (tx) => {
    const order = withId(await tx.get(ref));
    const after = { ...order, status: 'confirmado' };
    const commit = RESERVING_ORDER_STATUSES.has(order.status)
      ? await reserveInTx(tx, db, ctx, new Map(), order, after)
      : () => {};
    commit();
    const update = {
      status: 'confirmado', odooOrderId, odooOrderName, confirmingSince: null, errorDetail: null,
      confirmedAt: new Date(), confirmedBy: user, ...orderKeys(after), updatedAt: new Date(),
    };
    tx.update(ref, update);
    return { ...order, ...update };
  });
}

export async function markLinesDelivered(id, lineIds, user) {
  const order = await getOrder(id);
  const now = new Date();
  const lines = order.lines.map((l) => (lineIds.includes(l.lineId) ? { ...l, status: 'entregado', deliveredAt: now, deliveredBy: user } : l));
  await patchOrder(id, { lines });
}

// Anulación en la app (Odoo ya se canceló): libera reservas si quedaban.
export async function markOrderAnnulled(id, user, reason) {
  const db = getDb();
  const ref = db.collection(COLLECTION).doc(id);
  const ctx = await lineCtx((await getOrder(id)).localId);
  return db.runTransaction(async (tx) => {
    const order = withId(await tx.get(ref));
    const after = { ...order, status: 'anulado' };
    const commit = await reserveInTx(tx, db, ctx, new Map(), order, after);
    commit();
    const update = { status: 'anulado', annulledAt: new Date(), annulledBy: user, annulReason: reason ?? '', ...orderKeys(after), updatedAt: new Date() };
    tx.update(ref, update);
    return { ...order, ...update };
  });
}

export async function recordAutoRetry(id) {
  const db = getDb();
  const ref = db.collection(COLLECTION).doc(id);
  return db.runTransaction(async (tx) => {
    const order = withId(await tx.get(ref));
    if (order.status !== 'error') return false;
    tx.update(ref, { autoRetryCount: (order.autoRetryCount ?? 0) + 1, lastAutoRetryAt: new Date() });
    return true;
  });
}

// Historial: `months` = ['2026-10', ...]; Firestore admite hasta 30 valores en 'in'.
export async function listOrdersByMonth(localIds, months) {
  const keys = localIds.flatMap((l) => months.map((m) => `${l}_${m}`));
  const result = [];
  for (let i = 0; i < keys.length; i += 30) {
    const snap = await getDb().collection(COLLECTION).where('monthKey', 'in', keys.slice(i, i + 30)).get();
    result.push(...snap.docs.map(withId));
  }
  return result.filter((o) => o.status !== 'carrito' && o.status !== 'descartado')
    .sort((a, b) => toDate(b.createdAt) - toDate(a.createdAt));
}
```

- [ ] **Step 4: Correr** — `node --test test/posOrders.test.mjs` → PASS (7 tests). Luego `npm test` completo → verde.

- [ ] **Step 5: Commit**

```bash
git add backend/posOrders.mjs backend/test/posOrders.test.mjs
git commit -m "feat(pos): carritos, cola de caja, edición antes de confirmar y reclamo"
```

---

### Task 9: Odoo — cliente, pedido de venta, remitos por origen y factura

**Files:**
- Create: `Reportes/backend/posOdoo.mjs`
- Test: `Reportes/backend/test/posOdoo.test.mjs`

**Interfaces:**
- Consumes: de `feriaOdoo.mjs` (sin modificarlo): `ensureAuth`, `callKwReadWithRetry`, `docIdentityType`, `findIdentificationTypeIds`, `findPaymentMethodId`, `findProductIdBySku`, `buildSaleOrderPayload`, `buildShippingPartnerVals`, `createSaleOrder`, `confirmSaleOrder`, `readOrderName`, `readOrderLineIds`, `cancelSaleOrder`, `hasDeliveredMoves`; de `feriaPlacement.mjs`: `planMoveLocations`; `callKw` de `odoo.mjs`; `netOfIva` (Task 4).
- Produces:
  - Puras: `AFIP_RESPONSIBILITY_NAMES`, `buildPartnerVals(customer, ids) → vals`, `partnerUpdate(existing, customer, ids) → vals|null`, `buildPickupPartnerVals(parentId, customerName, label, address) → vals`, `buildOdooOrderLines(lines, totals, shippingProductId) → [{ productId, qty, unitPrice, discountPct, name? }]`, `splitByOrigin(lines) → { local: Line[], rolon: Line[] }`, `pickupLabelFor(line, locale, locales) → string|null`.
  - E/S: `findResponsibilityIds()`, `findPartnerForLookup(docNumber) → { id, name, email, phone, street, city, zip, afipResponsibility, tagIds } | null`, `findOrCreatePosPartner(customer) → partnerId`, `createChildPartner(vals) → id`, `moveRolonLines(odooOrderId, rolonOdooLineIds, { settings, partnerId }) → pickingId|null`, `alignLocalMoves(odooOrderId, items)`.
- **Depende del Spike S1 (Task 1).** `moveRolonLines` implementa la hipótesis verificada en el spike. Si el spike mostró otra receta, copiar la receta del documento de spikes acá y ajustar.

- [ ] **Step 1: Test**

```js
// test/posOdoo.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPartnerVals, partnerUpdate, buildOdooOrderLines, splitByOrigin, pickupLabelFor } from '../posOdoo.mjs';
import { DEFAULT_LOCALES } from '../posConfig.mjs';

const ids = {
  dni: 5, cuit: 4, state: null, country: null,
  responsibility: { responsable_inscripto: 1, consumidor_final: 5, monotributo: 6, exento: 4 },
};
const customer = {
  docNumber: '30712345671', name: 'Muebles SA', phone: '1155556666', email: 'compras@muebles.com',
  street: 'Av. Siempreviva 742', city: 'CABA', zip: '1428', afipResponsibility: 'responsable_inscripto', fromArca: true,
};

test('buildPartnerVals: CUIT con datos de ARCA queda listo para Factura A', () => {
  const vals = buildPartnerVals(customer, ids);
  assert.equal(vals.vat, '30712345671');
  assert.equal(vals.l10n_latam_identification_type_id, 4);
  assert.equal(vals.l10n_ar_afip_responsibility_type_id, 1);
  assert.equal(vals.street, 'Av. Siempreviva 742');
});

test('buildPartnerVals: DNI → consumidor final', () => {
  const vals = buildPartnerVals({ ...customer, docNumber: '30123456', afipResponsibility: null, fromArca: false }, ids);
  assert.equal(vals.l10n_latam_identification_type_id, 5);
  assert.equal(vals.l10n_ar_afip_responsibility_type_id, 5);
});

test('partnerUpdate: ARCA pisa razón social, domicilio y condición; email cambia si es distinto; teléfono solo si faltaba', () => {
  const existing = { name: 'MUEBLES', email: 'viejo@x.com', phone: '111', street: '', l10n_ar_afip_responsibility_type_id: [5, 'CF'] };
  const update = partnerUpdate(existing, customer, ids);
  assert.equal(update.name, 'Muebles SA');
  assert.equal(update.email, 'compras@muebles.com');
  assert.equal(update.l10n_ar_afip_responsibility_type_id, 1);
  assert.equal(update.phone, undefined);
  assert.equal(partnerUpdate({ ...existing, name: 'Muebles SA', email: 'compras@muebles.com', street: 'Av. Siempreviva 742', city: 'CABA', zip: '1428', l10n_ar_afip_responsibility_type_id: [1, 'RI'] }, customer, ids), null);
});

test('buildOdooOrderLines: precio sin IVA + % de la cascada; envío sin descuento', () => {
  const lines = [
    { productId: 10, qty: 2, basePrice: 12100, status: 'activo' },
    { productId: 11, qty: 1, basePrice: 999, status: 'eliminado' },
  ];
  const result = buildOdooOrderLines(lines, { lineDiscountPct: 23.5, shipping: 6050 }, 45870);
  assert.deepEqual(result, [
    { productId: 10, qty: 2, unitPrice: 10000, discountPct: 23.5 },
    { productId: 45870, qty: 1, unitPrice: 5000, discountPct: 0 },
  ]);
});

test('splitByOrigin y pickupLabelFor', () => {
  const lines = [
    { lineId: 'L1', origin: 'stock', delivery: 'ahora', status: 'activo' },
    { lineId: 'L2', origin: 'rolon', delivery: 'retira_otro_local', pickupLocalId: 'AL', status: 'activo' },
    { lineId: 'L3', origin: 'rolon', delivery: 'envio', status: 'eliminado' },
  ];
  const { local, rolon } = splitByOrigin(lines);
  assert.deepEqual(local.map((l) => l.lineId), ['L1']);
  assert.deepEqual(rolon.map((l) => l.lineId), ['L2']);
  const lomas = DEFAULT_LOCALES[0];
  assert.equal(pickupLabelFor(lines[1], lomas, DEFAULT_LOCALES), 'Retira en Local Alcorta');
  assert.equal(pickupLabelFor({ delivery: 'retira_local' }, lomas, DEFAULT_LOCALES), 'Retira en Local Las Lomas');
  assert.equal(pickupLabelFor({ delivery: 'retira_rolon' }, lomas, DEFAULT_LOCALES), 'Retira en Rolón');
  assert.equal(pickupLabelFor({ delivery: 'ahora' }, lomas, DEFAULT_LOCALES), null);
});
```

- [ ] **Step 2: Correr y ver que falla** — `node --test test/posOdoo.test.mjs` → FAIL.

- [ ] **Step 3: Implementar `posOdoo.mjs`**

```js
// Escrituras en Odoo del POS de locales. Reusa lo genérico de la feria
// (feriaOdoo/feriaPlacement no se modifican) y agrega: cliente con datos de
// ARCA, líneas con la cascada de descuentos y remito propio para Rolón.
import { callKw } from './odoo.mjs';
import { ensureAuth, callKwReadWithRetry, docIdentityType, findIdentificationTypeIds } from './feriaOdoo.mjs';
import { planMoveLocations } from './feriaPlacement.mjs';
import { netOfIva } from './posPricing.mjs';
import { activeLines } from './posLines.mjs';

export const AFIP_RESPONSIBILITY_NAMES = {
  responsable_inscripto: 'IVA Responsable Inscripto',
  consumidor_final: 'Consumidor Final',
  monotributo: 'Responsable Monotributo',
  exento: 'IVA Sujeto Exento',
};

let responsibilityCache = null;
export async function findResponsibilityIds() {
  if (responsibilityCache) return responsibilityCache;
  const rows = await callKwReadWithRetry('l10n_ar.afip.responsibility.type', 'search_read', [
    [['name', 'in', Object.values(AFIP_RESPONSIBILITY_NAMES)]],
  ], { fields: ['id', 'name'] });
  responsibilityCache = Object.fromEntries(Object.entries(AFIP_RESPONSIBILITY_NAMES)
    .map(([code, name]) => [code, rows.find((r) => r.name === name)?.id ?? null]));
  return responsibilityCache;
}

async function allIds() {
  const [types, responsibility] = await Promise.all([findIdentificationTypeIds(), findResponsibilityIds()]);
  return { ...types, responsibility };
}

function responsibilityCode(customer) {
  if (customer.afipResponsibility) return customer.afipResponsibility;
  return docIdentityType(customer.docNumber) === 'dni' ? 'consumidor_final' : null;
}

export function buildPartnerVals(customer, ids) {
  const vals = { name: customer.name, vat: customer.docNumber, phone: customer.phone, email: customer.email };
  const type = docIdentityType(customer.docNumber);
  if (type && ids[type]) vals.l10n_latam_identification_type_id = ids[type];
  const code = responsibilityCode(customer);
  if (code && ids.responsibility[code]) vals.l10n_ar_afip_responsibility_type_id = ids.responsibility[code];
  for (const field of ['street', 'city', 'zip']) if (customer[field]) vals[field] = customer[field];
  return vals;
}

// ARCA es la fuente de verdad de razón social, domicilio y condición de IVA;
// el email se pisa (la factura va ahí); el teléfono solo si faltaba.
export function partnerUpdate(existing, customer, ids) {
  const update = {};
  if (customer.fromArca) {
    if (customer.name && customer.name !== existing.name) update.name = customer.name;
    for (const field of ['street', 'city', 'zip']) {
      if (customer[field] && customer[field] !== (existing[field] || '')) update[field] = customer[field];
    }
  }
  const code = responsibilityCode(customer);
  const wanted = code ? ids.responsibility[code] : null;
  const current = existing.l10n_ar_afip_responsibility_type_id?.[0] ?? null;
  if (wanted && (customer.fromArca || !current) && wanted !== current) update.l10n_ar_afip_responsibility_type_id = wanted;
  if (customer.email && customer.email.toLowerCase() !== (existing.email || '').toLowerCase()) update.email = customer.email;
  if (!existing.phone && customer.phone) update.phone = customer.phone;
  return Object.keys(update).length ? update : null;
}

const PARTNER_FIELDS = ['id', 'name', 'email', 'phone', 'street', 'city', 'zip', 'category_id', 'l10n_ar_afip_responsibility_type_id'];
const CODE_BY_NAME = Object.fromEntries(Object.entries(AFIP_RESPONSIBILITY_NAMES).map(([code, name]) => [name, code]));

export async function findPartnerForLookup(docNumber) {
  const digits = String(docNumber ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const [p] = await callKwReadWithRetry('res.partner', 'search_read', [[['vat', '=', digits]]], { fields: PARTNER_FIELDS, limit: 1 });
  if (!p) return null;
  return {
    id: p.id, name: p.name, email: p.email || '', phone: p.phone || '', street: p.street || '', city: p.city || '', zip: p.zip || '',
    afipResponsibility: CODE_BY_NAME[p.l10n_ar_afip_responsibility_type_id?.[1]] ?? null, tagIds: p.category_id ?? [],
  };
}

export async function findOrCreatePosPartner(customer) {
  const ids = await allIds();
  const [existing] = await callKwReadWithRetry('res.partner', 'search_read', [[['vat', '=', customer.docNumber]]], { fields: PARTNER_FIELDS, limit: 1 });
  await ensureAuth();
  if (existing) {
    const update = partnerUpdate(existing, customer, ids);
    if (update) await callKw('res.partner', 'write', [[existing.id], update]);
    return existing.id;
  }
  const [id] = await callKw('res.partner', 'create', [[buildPartnerVals(customer, ids)]]);
  return id;
}

export async function createChildPartner(vals) {
  await ensureAuth();
  const [id] = await callKw('res.partner', 'create', [[vals]]);
  return id;
}

// Contacto de entrega para retiros: el remito muestra dónde lo busca.
export function buildPickupPartnerVals(parentId, customerName, label, address) {
  return { parent_id: parentId, type: 'delivery', name: `${customerName} — ${label}`, street: address || false };
}

export function pickupLabelFor(line, locale, locales) {
  if (line.delivery === 'retira_local') return `Retira en Local ${locale.name}`;
  if (line.delivery === 'retira_otro_local') return `Retira en Local ${locales.find((l) => l.id === line.pickupLocalId)?.name ?? line.pickupLocalId}`;
  if (line.delivery === 'retira_rolon') return 'Retira en Rolón';
  return null;
}

export function buildOdooOrderLines(lines, totals, shippingProductId) {
  const result = activeLines(lines).map((l) => ({
    productId: l.productId, qty: l.qty, unitPrice: netOfIva(l.basePrice), discountPct: totals.lineDiscountPct,
  }));
  if (shippingProductId && totals.shipping > 0) {
    result.push({ productId: shippingProductId, qty: 1, unitPrice: netOfIva(totals.shipping), discountPct: 0 });
  }
  return result;
}

export function splitByOrigin(lines) {
  const active = activeLines(lines);
  return { local: active.filter((l) => l.origin !== 'rolon'), rolon: active.filter((l) => l.origin === 'rolon') };
}

// Spike S1: lo que sale de Rolón va en un remito de "Rolón Local: Despachos"
// (lo que mira logística), del mismo grupo de abastecimiento que el pedido.
export async function moveRolonLines(odooOrderId, rolonOdooLineIds, { settings, partnerId }) {
  if (!rolonOdooLineIds.length) return null;
  const pickingTypeId = settings.rolon.outPickingTypeId;
  if (!pickingTypeId) throw new Error('Falta configurar el tipo de operación de despachos de Rolón (Admin → Ajustes)');
  const moves = await callKwReadWithRetry('stock.move', 'search_read', [[
    ['sale_line_id', 'in', rolonOdooLineIds], ['state', 'not in', ['done', 'cancel']],
  ]], { fields: ['id', 'picking_id', 'location_dest_id', 'group_id'] });
  if (!moves.length) return null;
  const [order] = await callKwReadWithRetry('sale.order', 'read', [[odooOrderId]], { fields: ['name'] });
  await ensureAuth();
  const originalPickings = [...new Set(moves.map((m) => m.picking_id?.[0]).filter(Boolean))];
  if (originalPickings.length) await callKw('stock.picking', 'do_unreserve', [originalPickings]);
  const [pickingId] = await callKw('stock.picking', 'create', [[{
    picking_type_id: pickingTypeId, location_id: settings.rolon.locationId,
    location_dest_id: moves[0].location_dest_id[0], partner_id: partnerId, origin: order.name,
    ...(moves[0].group_id ? { group_id: moves[0].group_id[0] } : {}),
  }]]);
  await callKw('stock.move', 'write', [moves.map((m) => m.id), {
    picking_id: pickingId, location_id: settings.rolon.locationId, picking_type_id: pickingTypeId,
    warehouse_id: settings.rolon.warehouseId,
  }]);
  await callKw('stock.picking', 'action_assign', [[pickingId, ...originalPickings]]);
  return pickingId;
}

// Lo del local sale de su ubicación exacta (Stock o Exhibición).
// `items`: [{ odooLineId, locationId }].
export async function alignLocalMoves(odooOrderId, items) {
  if (!items.length) return [];
  const moves = await callKwReadWithRetry('stock.move', 'search_read', [[
    ['sale_line_id', 'in', items.map((i) => i.odooLineId)], ['state', 'not in', ['done', 'cancel']],
  ]], { fields: ['id', 'sale_line_id', 'location_id', 'picking_id', 'state'] });
  const plan = planMoveLocations(moves, items.map((i) => ({ odooLineId: i.odooLineId, location: i.locationId })), (loc) => loc);
  if (!plan.length) return [];
  const pickingIds = [...new Set(plan.map((p) => p.pickingId).filter(Boolean))];
  await ensureAuth();
  if (pickingIds.length) await callKw('stock.picking', 'do_unreserve', [pickingIds]);
  for (const { moveId, locationId } of plan) await callKw('stock.move', 'write', [[moveId], { location_id: locationId }]);
  if (pickingIds.length) await callKw('stock.picking', 'action_assign', [pickingIds]);
  return plan;
}

export {
  findPaymentMethodId, findProductIdBySku, buildSaleOrderPayload, buildShippingPartnerVals, createSaleOrder,
  confirmSaleOrder, readOrderName, readOrderLineIds, cancelSaleOrder, hasDeliveredMoves,
  findOrderInvoices, createInvoiceFromOrder, postInvoice,
} from './feriaOdoo.mjs';
```

- [ ] **Step 4: Correr** — `node --test test/posOdoo.test.mjs` → PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/posOdoo.mjs backend/test/posOdoo.test.mjs
git commit -m "feat(pos): cliente con datos de ARCA, líneas para Odoo y remito de Rolón"
```

---

### Task 10: Confirmar en Odoo, reintento automático y anulación

**Files:**
- Create: `Reportes/backend/posConfirm.mjs`
- Test: `Reportes/backend/test/posConfirm.test.mjs`

**Interfaces:**
- Consumes: Tasks 3, 8, 9; `invoiceOrder` de `feriaInvoice.mjs` (acepta `deps` con `journalId`); `deliverLines`, `withOrderLock` de `feriaDelivery.mjs`; `principalPayment` (Task 4); `resolveOdooPaymentName` (Task 3).
- Produces:
  - `pairOdooLineIds(lines, odooLineIds) → lines` (asigna `odooLineId` en orden; la de envío va última).
  - `confirmPosOrder(order, user, ctx, deps) → order` — reintentable. `ctx = { locale, locales, settings, methodsById }`.
  - `claimAndConfirmPos(orderId, user) → order` (`err.stage = 'claim'|'odoo'`).
  - `retryFailedPosOrders(now)`, `startPosAutoRetry()`.
  - `annulPosOrder(orderId, user, reason) → order`.
  - `invoicingEnabledFor(locale) → boolean` (`POS_INVOICING_ENABLED === 'true'` y `invoiceJournalId`).

- [ ] **Step 1: Test** (incluye Review Focus #5)

```js
// test/posConfirm.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmPosOrder, pairOdooLineIds, invoicingEnabledFor } from '../posConfirm.mjs';
import { DEFAULT_LOCALES, DEFAULT_SETTINGS, DEFAULT_PAYMENT_METHODS } from '../posConfig.mjs';

const ctx = {
  locale: DEFAULT_LOCALES[0], locales: DEFAULT_LOCALES,
  settings: { ...DEFAULT_SETTINGS, rolon: { ...DEFAULT_SETTINGS.rolon, outPickingTypeId: 99 } },
  methodsById: new Map(DEFAULT_PAYMENT_METHODS.map((m) => [m.id, m])),
};

const baseOrder = () => ({
  id: 'o1', number: 'LL-0001', localId: 'LL', status: 'pendiente', wantsInvoice: false,
  customer: { docNumber: '30123456', name: 'Ana', phone: '1155556666', email: 'a@b.com' },
  payments: [{ methodId: 'efectivo', detailId: null, amount: null }],
  totals: { lineDiscountPct: 15, shipping: 0, total: 1028.5 },
  shipping: null,
  lines: [
    { lineId: 'L1', productId: 10, sku: 'A', qty: 1, basePrice: 1210, origin: 'stock', delivery: 'ahora', status: 'activo' },
    { lineId: 'L2', productId: 11, sku: 'B', qty: 1, basePrice: 1210, origin: 'rolon', delivery: 'retira_local', status: 'activo' },
  ],
});

function fakeDeps(overrides = {}) {
  const calls = [];
  const rec = (name, result) => async (...args) => { calls.push([name, ...args]); return typeof result === 'function' ? result(...args) : result; };
  const deps = {
    findOrCreatePosPartner: rec('partner', 500),
    findPaymentMethodId: rec('paymentMethod', 5),
    findProductIdBySku: rec('productBySku', 45870),
    createChildPartner: rec('childPartner', 600),
    createSaleOrder: rec('createSaleOrder', 9000),
    saveOdooOrderId: rec('saveOdooOrderId'),
    readOrderLineIds: rec('readOrderLineIds', [71, 72]),
    saveOdooLineIds: rec('saveOdooLineIds'),
    confirmSaleOrder: rec('confirmSaleOrder'),
    readOrderName: rec('readOrderName', 'S01234'),
    markOrderConfirmed: rec('markOrderConfirmed'),
    getOrder: rec('getOrder', () => ({ ...baseOrder(), status: 'confirmado', odooOrderId: 9000, lines: baseOrder().lines.map((l, i) => ({ ...l, odooLineId: 71 + i })) })),
    moveRolonLines: rec('moveRolonLines', 777),
    alignLocalMoves: rec('alignLocalMoves', []),
    deliverLines: rec('deliverLines', { delivered: [71], alreadyDone: [] }),
    markLinesDelivered: rec('markLinesDelivered'),
    setOrderWarning: rec('setOrderWarning'),
    invoice: rec('invoice', { status: 'skipped' }),
    ...overrides,
  };
  return { deps, calls };
}

test('pairOdooLineIds: asigna en orden y avisa si Odoo devolvió menos', () => {
  const lines = baseOrder().lines;
  assert.deepEqual(pairOdooLineIds(lines, [71, 72]).map((l) => l.odooLineId), [71, 72]);
  assert.throws(() => pairOdooLineIds(lines, [71]), /devolvió 1 líneas/);
});

test('confirmPosOrder: crea, confirma, arma el remito de Rolón y entrega lo de "ahora"', async () => {
  const { deps, calls } = fakeDeps();
  await confirmPosOrder(baseOrder(), 'Caja Lomas', ctx, deps);
  const names = calls.map((c) => c[0]);
  assert.deepEqual(names.slice(0, 3), ['partner', 'paymentMethod', 'childPartner']);
  assert.ok(names.includes('createSaleOrder'));
  const payload = calls.find((c) => c[0] === 'createSaleOrder')[1];
  assert.equal(payload.team_id, 6);
  assert.equal(payload.warehouse_id, 1);
  assert.equal(payload.client_order_ref, 'LL-0001');
  assert.equal(payload.order_line.length, 2);
  assert.equal(payload.order_line[0][2].price_unit, 1000);
  assert.equal(payload.order_line[0][2].discount, 15);
  assert.deepEqual(calls.find((c) => c[0] === 'moveRolonLines').slice(1, 3), [9000, [72]]);
  assert.deepEqual(calls.find((c) => c[0] === 'deliverLines')[2], [{ odooLineId: 71, qty: 1, locationId: 8 }]);
  assert.deepEqual(calls.find((c) => c[0] === 'markLinesDelivered')[2], ['L1']);
});

test('confirmPosOrder: reintento con odooOrderId ya guardado NO crea otro pedido', async () => {
  const { deps, calls } = fakeDeps();
  await confirmPosOrder({ ...baseOrder(), status: 'error', odooOrderId: 9000 }, 'Reintento', ctx, deps);
  assert.equal(calls.filter((c) => c[0] === 'createSaleOrder').length, 0);
  assert.equal(calls.filter((c) => c[0] === 'confirmSaleOrder').length, 1);
});

test('confirmPosOrder: si falla el remito de Rolón, la venta queda confirmada con aviso', async () => {
  const { deps, calls } = fakeDeps({ moveRolonLines: async () => { throw new Error('sin tipo de operación'); } });
  await confirmPosOrder(baseOrder(), 'Caja', ctx, deps);
  const warning = calls.find((c) => c[0] === 'setOrderWarning');
  assert.match(warning[2], /remito de Rolón/);
  assert.ok(calls.some((c) => c[0] === 'markOrderConfirmed'));
});

test('invoicingEnabledFor: necesita la variable y el diario del local', () => {
  delete process.env.POS_INVOICING_ENABLED;
  assert.equal(invoicingEnabledFor({ invoiceJournalId: 32 }), false);
  process.env.POS_INVOICING_ENABLED = 'true';
  assert.equal(invoicingEnabledFor({ invoiceJournalId: 32 }), true);
  assert.equal(invoicingEnabledFor({ invoiceJournalId: null }), false);
  delete process.env.POS_INVOICING_ENABLED;
});
```

- [ ] **Step 2: Correr y ver que falla** — `node --test test/posConfirm.test.mjs` → FAIL.

- [ ] **Step 3: Implementar `posConfirm.mjs`**

```js
// Confirmar una venta del POS en Odoo. Reintentable: si un intento anterior
// ya creó el sale.order (odooOrderId guardado), no se crea otro. Lo que falla
// después de confirmar (remito de Rolón, entrega en el acto, factura) no
// deshace la venta: queda un aviso para resolverlo.
import {
  getLocale, getLocales, getSettings, getPaymentMethodsById, originLocationId, resolveOdooPaymentName,
} from './posConfig.mjs';
import { principalPayment } from './posPricing.mjs';
import { needsShipping, shouldAutoRetry } from './posLines.mjs';
import * as orders from './posOrders.mjs';
import * as odoo from './posOdoo.mjs';
import { deliverLines } from './feriaDelivery.mjs';
import { invoiceOrder } from './feriaInvoice.mjs';
import { getDb } from './firestore.mjs';

const RETRY_EVERY_MS = 3 * 60 * 1000;
const RETRY_USER = 'Reintento automático';

export function invoicingEnabledFor(locale) {
  return process.env.POS_INVOICING_ENABLED === 'true' && Boolean(locale?.invoiceJournalId);
}

export function pairOdooLineIds(lines, odooLineIds) {
  const active = lines.filter((l) => l.status !== 'eliminado');
  if (odooLineIds.length < active.length) {
    throw new Error(`Odoo devolvió ${odooLineIds.length} líneas y el pedido tiene ${active.length}`);
  }
  const byLine = new Map(active.map((l, i) => [l.lineId, odooLineIds[i]]));
  return lines.map((l) => (byLine.has(l.lineId) ? { ...l, odooLineId: byLine.get(l.lineId) } : l));
}

function defaultDeps() {
  return {
    findOrCreatePosPartner: odoo.findOrCreatePosPartner, findPaymentMethodId: odoo.findPaymentMethodId,
    findProductIdBySku: odoo.findProductIdBySku, createChildPartner: odoo.createChildPartner,
    createSaleOrder: odoo.createSaleOrder, saveOdooOrderId: orders.saveOdooOrderId,
    readOrderLineIds: odoo.readOrderLineIds, saveOdooLineIds: orders.saveOdooLineIds,
    confirmSaleOrder: odoo.confirmSaleOrder, readOrderName: odoo.readOrderName,
    markOrderConfirmed: orders.markOrderConfirmed, getOrder: orders.getOrder,
    moveRolonLines: odoo.moveRolonLines, alignLocalMoves: odoo.alignLocalMoves,
    deliverLines, markLinesDelivered: orders.markLinesDelivered, setOrderWarning: orders.setOrderWarning,
    invoice: (order, journalId) => invoiceOrder(order, {
      journalId, findOrderInvoices: odoo.findOrderInvoices,
      createInvoiceFromOrder: odoo.createInvoiceFromOrder, postInvoice: odoo.postInvoice,
      markOrderInvoiced: orders.markOrderInvoiced, setInvoiceError: orders.setInvoiceError,
    }),
  };
}

// Contacto de entrega del pedido: envío → dirección del cliente; retiro →
// "Retira en Local X"; todo "ahora" → el cliente.
async function shippingPartnerFor(order, partnerId, ctx, deps) {
  const active = order.lines.filter((l) => l.status !== 'eliminado');
  if (needsShipping(active)) {
    return deps.createChildPartner(odoo.buildShippingPartnerVals(partnerId, order.customer.name, order.shipping));
  }
  const pickup = active.find((l) => odoo.pickupLabelFor(l, ctx.locale, ctx.locales));
  if (!pickup) return null;
  const label = odoo.pickupLabelFor(pickup, ctx.locale, ctx.locales);
  const address = pickup.delivery === 'retira_otro_local'
    ? ctx.locales.find((l) => l.id === pickup.pickupLocalId)?.address
    : pickup.delivery === 'retira_local' ? ctx.locale.address : '';
  return deps.createChildPartner(odoo.buildPickupPartnerVals(partnerId, order.customer.name, label, address));
}

export async function confirmPosOrder(order, user, ctx, deps = defaultDeps()) {
  let odooOrderId = order.odooOrderId;
  let partnerShippingId = null;
  const partnerId = await deps.findOrCreatePosPartner(order.customer);

  if (!odooOrderId) {
    const principal = principalPayment(order.payments, ctx.methodsById);
    const odooPaymentName = resolveOdooPaymentName(ctx.methodsById.get(principal.methodId), principal.detailId);
    const paymentMethodId = await deps.findPaymentMethodId(odooPaymentName);
    if (!paymentMethodId) throw new Error(`Medio de pago no encontrado en Odoo: "${odooPaymentName}"`);
    partnerShippingId = await shippingPartnerFor(order, partnerId, ctx, deps);
    let shippingProductId = null;
    if (order.totals.shipping > 0) {
      shippingProductId = await deps.findProductIdBySku(ctx.settings.shippingProductSku);
      if (!shippingProductId) throw new Error(`Producto de envío no encontrado en Odoo: ${ctx.settings.shippingProductSku}`);
    }
    const vals = odoo.buildSaleOrderPayload({
      partnerId, pricelistId: ctx.settings.fullPricelistId || undefined, teamId: ctx.locale.teamId, paymentMethodId,
      warehouseId: ctx.locale.warehouseId, partnerShippingId, clientOrderRef: order.number,
      lines: odoo.buildOdooOrderLines(order.lines, order.totals, shippingProductId),
    });
    if (!vals.pricelist_id) delete vals.pricelist_id;
    odooOrderId = await deps.createSaleOrder(vals);
    // Se guarda ANTES de seguir: un reintento no tiene que crear otro pedido.
    await deps.saveOdooOrderId(order.id, odooOrderId);
  }

  let lines = order.lines;
  if (lines.some((l) => l.status !== 'eliminado' && !l.odooLineId)) {
    lines = pairOdooLineIds(lines, await deps.readOrderLineIds(odooOrderId));
    await deps.saveOdooLineIds(order.id, lines);
  }

  await deps.confirmSaleOrder(odooOrderId);
  const odooOrderName = await deps.readOrderName(odooOrderId);
  await deps.markOrderConfirmed(order.id, { odooOrderId, odooOrderName, user });
  const confirmed = await deps.getOrder(order.id);
  const { local, rolon } = odoo.splitByOrigin(confirmed.lines);
  const warnings = [];

  try {
    await deps.moveRolonLines(odooOrderId, rolon.map((l) => l.odooLineId), { settings: ctx.settings, partnerId: partnerShippingId ?? partnerId });
  } catch (err) {
    warnings.push(`No se pudo armar el remito de Rolón (${err.message}): hacelo en Odoo`);
  }
  try {
    await deps.alignLocalMoves(odooOrderId, local.map((l) => ({ odooLineId: l.odooLineId, locationId: originLocationId(ctx.locale, ctx.settings, l.origin) })));
  } catch (err) {
    warnings.push(`No se pudo ubicar el remito del local (${err.message})`);
  }

  const ahora = local.filter((l) => l.delivery === 'ahora' && l.status === 'activo');
  if (ahora.length) {
    try {
      await deps.deliverLines(odooOrderId, ahora.map((l) => ({
        odooLineId: l.odooLineId, qty: l.qty, locationId: originLocationId(ctx.locale, ctx.settings, l.origin),
      })));
      await deps.markLinesDelivered(order.id, ahora.map((l) => l.lineId), user);
    } catch (err) {
      warnings.push(`Venta confirmada, pero no se pudo validar la entrega en el acto (${err.message}): validá el remito en Odoo`);
    }
  }
  if (warnings.length) await deps.setOrderWarning(order.id, warnings.join(' · '));

  if (confirmed.wantsInvoice && invoicingEnabledFor(ctx.locale)) {
    await deps.invoice({ ...confirmed, odooOrderId }, ctx.locale.invoiceJournalId);
  }
  return deps.getOrder(order.id);
}

async function loadCtx(localId) {
  const [locale, locales, settings, methodsById] = await Promise.all([
    getLocale(localId), getLocales(), getSettings(), getPaymentMethodsById(),
  ]);
  return { locale, locales, settings, methodsById };
}

export async function claimAndConfirmPos(orderId, user) {
  let order;
  try {
    const claim = await orders.claimOrderForConfirm(orderId, user);
    if (claim.alreadyConfirmed) return claim.order;
    order = claim.order;
  } catch (err) {
    err.stage = 'claim';
    throw err;
  }
  try {
    return await confirmPosOrder(order, user.name, await loadCtx(order.localId));
  } catch (err) {
    try {
      await orders.markOrderError(order.id, err.message);
    } catch (markErr) {
      console.error('[pos] no se pudo marcar el pedido como error:', markErr.message);
    }
    err.stage = 'odoo';
    throw err;
  }
}

export async function retryFailedPosOrders(now = Date.now()) {
  const locales = await getLocales();
  const snap = await getDb().collection(orders.COLLECTION).where('queueKey', 'in', locales.map((l) => `${l.id}_error`)).get();
  const due = snap.docs.filter((d) => shouldAutoRetry(d.data(), now));
  let confirmed = 0;
  for (const doc of due) {
    try {
      const localId = doc.data().localId;
      // Con la caja del local cerrada no se confirma: no se gastan intentos.
      const pointer = await orders.cashPointerRef(getDb(), localId).get();
      if (!pointer.data()?.openSessionId) continue;
      if (!(await orders.recordAutoRetry(doc.id))) continue;
      await claimAndConfirmPos(doc.id, { id: 'auto', name: RETRY_USER, role: 'caja', localId });
      confirmed += 1;
    } catch (err) {
      console.error(`[posRetry] ${doc.id} sigue sin confirmar (${err.stage ?? 'error'}): ${err.message}`);
    }
  }
  return { due: due.length, confirmed };
}

export function startPosAutoRetry() {
  const run = () => retryFailedPosOrders().catch((err) => console.error('[posRetry] error:', err.message));
  setInterval(run, RETRY_EVERY_MS);
}

// Anular una venta confirmada sin factura y sin nada entregado. Con factura
// hace falta nota de crédito (Fase 2): se deriva a facturación.
export async function annulPosOrder(orderId, user, reason) {
  const order = await orders.getOrder(orderId);
  if (order.localId !== user.localId) throw Object.assign(new Error('No tenés acceso a ese local'), { status: 403 });
  if (order.status !== 'confirmado' || !order.odooOrderId) throw new Error('Solo se anulan ventas confirmadas');
  if (order.invoiceName) throw new Error(`La venta tiene la factura ${order.invoiceName}: la anulación con nota de crédito la hace facturación`);
  if (order.lines.some((l) => l.status === 'entregado') || await odoo.hasDeliveredMoves(order.odooOrderId)) {
    throw new Error('Parte del pedido ya se entregó: la devolución se hace en Odoo');
  }
  await odoo.cancelSaleOrder(order.odooOrderId);
  return orders.markOrderAnnulled(orderId, user.name, reason);
}
```

- [ ] **Step 4: Correr** — `node --test test/posConfirm.test.mjs` → PASS (5 tests). `npm test` → verde.

- [ ] **Step 5: Commit**

```bash
git add backend/posConfirm.mjs backend/test/posConfirm.test.mjs
git commit -m "feat(pos): confirmar en Odoo con remitos por origen, reintento y anulación"
```

---

### Task 11: Caja del día por local

**Files:**
- Create: `Reportes/backend/posCash.mjs`
- Test: `Reportes/backend/test/posCash.test.mjs`

**Interfaces:**
- Consumes: `cashPointerRef`, `COLLECTION` (Task 8); `isConfirming` (Task 7); `parseAmount`, `cleanNotes`, `voidCashMovement` de `feriaCash.mjs` (puras, sin modificar).
- Produces:
  - Sesión (`pos_cash_sessions/{id}`): `{ localId, status: 'abierta'|'cerrada', openingCash, openedAt, openedBy, movements: Movement[], notes, closedAt?, closedBy?, countedCash?, summary? }`.
  - Movement: `{ id, type: 'gasto'|'retiro'|'ingreso_usd', concept, amount, usdAmount?, rate?, at, by, voidedAt?, voidedBy? }` (`amount` en pesos; para `ingreso_usd`, `amount = usdAmount × rate`).
  - `CASH_METHOD_ID = 'efectivo'`.
  - `paymentsOf(order) → [{ methodId, detailId, amount }]` (un solo medio → todo el total).
  - `computeCashSummary(orders, { openingCash, countedCash, movements }) → { sales, annulled, byMethod: { [methodId]: number }, byDetail: { ['credito:6']: number }, total, openingCash, expenses, withdrawals, usd: { amount, pesos }, expectedCash, countedCash, difference }`.
  - `buildPosCashMovement(input, { user, now, id }) → Movement`.
  - E/S: `getCurrentCash(localId) → { session, summary, lastClosed }`, `openCashSession({ localId, openingCash, user })`, `closeCashSession({ localId, countedCash, notes, user })`, `addCashMovement(localId, input, user)`, `voidOpenCashMovement(localId, movementId, user)`, `updateCashNotes(localId, notes)`, `listCashSessions(localId|null, limit)`.

- [ ] **Step 1: Test**

```js
// test/posCash.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCashSummary, paymentsOf, buildPosCashMovement } from '../posCash.mjs';

const order = (payments, total, over = {}) => ({ status: 'confirmado', payments, totals: { total }, ...over });

test('paymentsOf: con un solo medio, todo el total va a ese medio', () => {
  assert.deepEqual(paymentsOf(order([{ methodId: 'efectivo', detailId: null, amount: null }], 8500)), [{ methodId: 'efectivo', detailId: null, amount: 8500 }]);
});

test('computeCashSummary: por medio y por detalle, pago dividido, anuladas aparte', () => {
  const orders = [
    order([{ methodId: 'efectivo', amount: null }], 8500),
    order([{ methodId: 'transferencia', amount: 3000 }, { methodId: 'credito', detailId: '6', amount: 7000 }], 10000),
    order([{ methodId: 'efectivo', amount: null }], 999, { status: 'anulado', odooOrderId: 1 }),
    order([{ methodId: 'efectivo', amount: null }], 5, { status: 'pendiente' }),
  ];
  const s = computeCashSummary(orders, { openingCash: 20000, movements: [] });
  assert.equal(s.sales, 2);
  assert.equal(s.annulled, 1);
  assert.deepEqual(s.byMethod, { efectivo: 8500, transferencia: 3000, credito: 7000 });
  assert.deepEqual(s.byDetail, { 'credito:6': 7000 });
  assert.equal(s.total, 18500);
  assert.equal(s.expectedCash, 28500);
});

test('computeCashSummary: gastos y retiros restan del efectivo; USD aparte; anulados no cuentan', () => {
  const movements = [
    { type: 'gasto', amount: 1500 }, { type: 'retiro', amount: 10000 },
    { type: 'gasto', amount: 999, voidedAt: new Date() },
    { type: 'ingreso_usd', usdAmount: 100, rate: 1200, amount: 120000 },
  ];
  const s = computeCashSummary([], { openingCash: 20000, countedCash: 8000, movements });
  assert.equal(s.expenses, 1500);
  assert.equal(s.withdrawals, 10000);
  assert.deepEqual(s.usd, { amount: 100, pesos: 120000 });
  assert.equal(s.expectedCash, 8500);
  assert.equal(s.difference, -500);
});

test('buildPosCashMovement: gasto pide concepto; USD pide monto y cotización', () => {
  const meta = { user: 'Caja', now: new Date(0), id: 'm1' };
  assert.throws(() => buildPosCashMovement({ type: 'gasto', amount: 100 }, meta), /concepto/);
  const usd = buildPosCashMovement({ type: 'ingreso_usd', usdAmount: 50, rate: 1100, concept: 'Pago LL-0003' }, meta);
  assert.equal(usd.amount, 55000);
  assert.throws(() => buildPosCashMovement({ type: 'ingreso_usd', usdAmount: 50 }, meta), /cotización/);
});
```

- [ ] **Step 2: Correr y ver que falla** — `node --test test/posCash.test.mjs` → FAIL.

- [ ] **Step 3: Implementar `posCash.mjs`**

```js
// Caja del día de cada local: se abre con el fondo, registra gastos,
// retiros e ingresos en dólares, y se cierra contando el efectivo. Cada
// venta queda atada a la caja en la que se confirmó (cashSessionId).
import crypto from 'node:crypto';
import { getDb } from './firestore.mjs';
import { cashPointerRef, COLLECTION as ORDERS } from './posOrders.mjs';
import { isConfirming } from './posLines.mjs';
import { parseAmount, cleanNotes, voidCashMovement } from './feriaCash.mjs';
import { round2 } from './posPricing.mjs';

const SESSIONS = 'pos_cash_sessions';
export const CASH_METHOD_ID = 'efectivo';
const MOVEMENT_TYPES = { gasto: 'Gasto', retiro: 'Retiro', ingreso_usd: 'Ingreso en dólares' };

export function paymentsOf(order) {
  const payments = order.payments ?? [];
  if (payments.length === 1 || payments.every((p) => p.amount == null)) {
    return [{ methodId: payments[0]?.methodId, detailId: payments[0]?.detailId ?? null, amount: order.totals?.total ?? 0 }];
  }
  return payments.map((p) => ({ methodId: p.methodId, detailId: p.detailId ?? null, amount: p.amount }));
}

export function computeCashSummary(orders, { openingCash, countedCash = null, movements = [] }) {
  const sold = orders.filter((o) => o.status === 'confirmado');
  const byMethod = {};
  const byDetail = {};
  for (const order of sold) {
    for (const { methodId, detailId, amount } of paymentsOf(order)) {
      byMethod[methodId] = round2((byMethod[methodId] ?? 0) + amount);
      if (detailId) byDetail[`${methodId}:${detailId}`] = round2((byDetail[`${methodId}:${detailId}`] ?? 0) + amount);
    }
  }
  const active = movements.filter((m) => !m.voidedAt);
  const sumOf = (type, field = 'amount') => round2(active.filter((m) => m.type === type).reduce((s, m) => s + (m[field] ?? 0), 0));
  const expenses = sumOf('gasto');
  const withdrawals = sumOf('retiro');
  const usd = { amount: sumOf('ingreso_usd', 'usdAmount'), pesos: sumOf('ingreso_usd') };
  const total = round2(Object.values(byMethod).reduce((s, v) => s + v, 0));
  const expectedCash = round2(openingCash + (byMethod[CASH_METHOD_ID] ?? 0) - expenses - withdrawals);
  return {
    sales: sold.length,
    annulled: orders.filter((o) => o.status === 'anulado' && o.odooOrderId).length,
    byMethod, byDetail, total, openingCash, expenses, withdrawals, usd, expectedCash,
    countedCash, difference: countedCash == null ? null : round2(countedCash - expectedCash),
  };
}

export function buildPosCashMovement({ type, concept, amount, usdAmount, rate }, { user, now, id }) {
  if (!MOVEMENT_TYPES[type]) throw new Error(`Tipo de movimiento inválido: ${type}`);
  const text = String(concept ?? '').trim().slice(0, 120);
  if (type === 'gasto' && !text) throw new Error('Escribí el concepto del gasto (ej. librería, ferretería)');
  if (type === 'ingreso_usd') {
    const usd = parseAmount(usdAmount);
    if (usd <= 0) throw new Error('Monto en dólares inválido');
    if (rate == null || rate === '') throw new Error('Falta la cotización del dólar');
    const r = parseAmount(rate);
    if (r <= 0) throw new Error('Cotización inválida');
    return { id, type, concept: text || 'Ingreso en dólares', usdAmount: usd, rate: r, amount: round2(usd * r), at: now, by: user };
  }
  const value = parseAmount(amount);
  if (value <= 0) throw new Error('Monto inválido');
  return { id, type, concept: text || MOVEMENT_TYPES[type], amount: value, at: now, by: user };
}

const withId = (snap) => ({ id: snap.id, ...snap.data() });

async function sessionOrders(sessionId, tx = null) {
  const query = getDb().collection(ORDERS).where('cashSessionId', '==', sessionId);
  const snap = tx ? await tx.get(query) : await query.get();
  return snap.docs.map(withId);
}

export async function listCashSessions(localId = null, limit = 60) {
  const col = getDb().collection(SESSIONS);
  const snap = localId ? await col.where('localId', '==', localId).get() : await col.get();
  return snap.docs.map(withId)
    .sort((a, b) => b.openedAt.toMillis() - a.openedAt.toMillis())
    .slice(0, limit);
}

export async function getCurrentCash(localId) {
  const db = getDb();
  const id = (await cashPointerRef(db, localId).get()).data()?.openSessionId;
  const lastClosed = (await listCashSessions(localId, 5)).find((s) => s.status === 'cerrada') ?? null;
  if (!id) return { session: null, summary: null, lastClosed };
  const session = withId(await db.collection(SESSIONS).doc(id).get());
  const summary = computeCashSummary(await sessionOrders(id), { openingCash: session.openingCash, movements: session.movements });
  return { session, summary, lastClosed };
}

export async function openCashSession({ localId, openingCash, user }) {
  const amount = parseAmount(openingCash);
  const db = getDb();
  return db.runTransaction(async (tx) => {
    const pointer = await tx.get(cashPointerRef(db, localId));
    if (pointer.data()?.openSessionId) throw new Error('Ya hay una caja abierta en este local: cerrala antes de abrir otra');
    const ref = db.collection(SESSIONS).doc();
    const session = { localId, status: 'abierta', openingCash: amount, openedAt: new Date(), openedBy: user, movements: [], notes: '' };
    tx.set(ref, session);
    tx.set(cashPointerRef(db, localId), { openSessionId: ref.id, updatedAt: new Date() });
    return { id: ref.id, ...session };
  });
}

export async function closeCashSession({ localId, countedCash, notes, user }) {
  const counted = parseAmount(countedCash);
  const db = getDb();
  return db.runTransaction(async (tx) => {
    const id = (await tx.get(cashPointerRef(db, localId))).data()?.openSessionId;
    if (!id) throw new Error('No hay ninguna caja abierta en este local');
    const ref = db.collection(SESSIONS).doc(id);
    const session = withId(await tx.get(ref));
    const orders = await sessionOrders(id, tx);
    if (orders.some((o) => isConfirming(o))) throw new Error('Hay una venta confirmándose: esperá unos segundos y volvé a cerrar');
    const summary = computeCashSummary(orders, { openingCash: session.openingCash, countedCash: counted, movements: session.movements });
    const closed = { status: 'cerrada', closedAt: new Date(), closedBy: user, countedCash: counted, notes: cleanNotes(notes ?? session.notes), summary };
    tx.update(ref, closed);
    tx.set(cashPointerRef(db, localId), { openSessionId: null, updatedAt: new Date() });
    return { ...session, ...closed };
  });
}

async function updateOpenSession(localId, change) {
  const db = getDb();
  return db.runTransaction(async (tx) => {
    const id = (await tx.get(cashPointerRef(db, localId))).data()?.openSessionId;
    if (!id) throw new Error('No hay ninguna caja abierta en este local');
    const ref = db.collection(SESSIONS).doc(id);
    const session = withId(await tx.get(ref));
    const update = { ...change(session), updatedAt: new Date() };
    tx.update(ref, update);
    return { ...session, ...update };
  });
}

export function addCashMovement(localId, input, user) {
  const movement = buildPosCashMovement(input, { user, now: new Date(), id: crypto.randomUUID() });
  return updateOpenSession(localId, (s) => ({ movements: [...(s.movements ?? []), movement] }));
}

export function voidOpenCashMovement(localId, movementId, user) {
  return updateOpenSession(localId, (s) => ({ movements: voidCashMovement(s.movements ?? [], movementId, { user, now: new Date() }) }));
}

export function updateCashNotes(localId, notes) {
  return updateOpenSession(localId, () => ({ notes: cleanNotes(notes) }));
}
```

- [ ] **Step 4: Correr** — `node --test test/posCash.test.mjs` → PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/posCash.mjs backend/test/posCash.test.mjs
git commit -m "feat(pos): caja del día por local con gastos, retiros y dólares"
```

---

### Task 12: Estadísticas

**Files:**
- Create: `Reportes/backend/posStats.mjs`
- Test: `Reportes/backend/test/posStats.test.mjs`

**Interfaces:**
- Consumes: `paymentsOf` (Task 11), `netOfIva`, `round2` (Task 4).
- Produces: `computePosStats(orders, { from, to }) → { sales, total, net, averageTicket, byLocal: [{ localId, sales, total }], bySeller: [{ sellerId, sellerName, localId, sales, total }], byMethod: { [methodId]: number }, topProducts: [{ sku, name, qty, total }] }` (solo `confirmado`, `confirmedAt` dentro de `[from, to)`; top 20 por total), `monthsBetween(from, to) → ['YYYY-MM', ...]`.

- [ ] **Step 1: Test**

```js
// test/posStats.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePosStats, monthsBetween } from '../posStats.mjs';

const at = (iso) => ({ toMillis: () => new Date(iso).getTime() });
const order = (over) => ({
  status: 'confirmado', localId: 'LL', sellerId: 's1', sellerName: 'Ana', confirmedAt: at('2026-10-10T15:00:00-03:00'),
  payments: [{ methodId: 'efectivo', amount: null }], totals: { total: 12100, lineDiscountPct: 0 },
  lines: [{ sku: 'A', name: 'Silla', qty: 2, basePrice: 6050, status: 'activo' }], ...over,
});

test('computePosStats: totales, por local, vendedor, medio y productos', () => {
  const orders = [
    order({}),
    order({ localId: 'AL', sellerId: 's2', sellerName: 'Beto', totals: { total: 1210, lineDiscountPct: 0 }, lines: [{ sku: 'B', name: 'Mesa', qty: 1, basePrice: 1210, status: 'activo' }] }),
    order({ status: 'anulado' }),
    order({ confirmedAt: at('2026-09-01T10:00:00-03:00') }),
  ];
  const s = computePosStats(orders, { from: new Date('2026-10-01T00:00:00-03:00').getTime(), to: new Date('2026-11-01T00:00:00-03:00').getTime() });
  assert.equal(s.sales, 2);
  assert.equal(s.total, 13310);
  assert.equal(s.net, 11000);
  assert.equal(s.averageTicket, 6655);
  assert.deepEqual(s.byLocal, [{ localId: 'LL', sales: 1, total: 12100 }, { localId: 'AL', sales: 1, total: 1210 }]);
  assert.equal(s.bySeller[0].sellerName, 'Ana');
  assert.deepEqual(s.byMethod, { efectivo: 13310 });
  assert.deepEqual(s.topProducts[0], { sku: 'A', name: 'Silla', qty: 2, total: 12100 });
});

test('monthsBetween: meses que toca un rango', () => {
  assert.deepEqual(monthsBetween(new Date('2026-09-15T12:00:00-03:00'), new Date('2026-11-02T12:00:00-03:00')), ['2026-09', '2026-10', '2026-11']);
});
```

- [ ] **Step 2: Correr y ver que falla** — `node --test test/posStats.test.mjs` → FAIL.

- [ ] **Step 3: Implementar `posStats.mjs`**

```js
// Estadísticas del POS a partir de los pedidos confirmados (Firestore). Los
// importes son con IVA; `net` es el total sin IVA.
import { paymentsOf } from './posCash.mjs';
import { netOfIva, round2 } from './posPricing.mjs';

const ms = (v) => (v?.toMillis ? v.toMillis() : new Date(v).getTime());

export function monthsBetween(from, to) {
  const months = [];
  const shift = (d) => new Date(new Date(d).getTime() - 3 * 60 * 60 * 1000);
  const start = shift(from);
  const end = shift(to);
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth();
  while (y < end.getUTCFullYear() || (y === end.getUTCFullYear() && m <= end.getUTCMonth())) {
    months.push(`${y}-${String(m + 1).padStart(2, '0')}`);
    m += 1;
    if (m === 12) { m = 0; y += 1; }
  }
  return months;
}

function bump(map, key, init, apply) {
  if (!map.has(key)) map.set(key, init());
  apply(map.get(key));
}

export function computePosStats(orders, { from = 0, to = Infinity } = {}) {
  const sold = orders.filter((o) => o.status === 'confirmado' && ms(o.confirmedAt) >= from && ms(o.confirmedAt) < to);
  const byLocal = new Map();
  const bySeller = new Map();
  const byMethod = {};
  const products = new Map();
  let total = 0;
  for (const o of sold) {
    const t = o.totals?.total ?? 0;
    total += t;
    bump(byLocal, o.localId, () => ({ localId: o.localId, sales: 0, total: 0 }), (r) => { r.sales += 1; r.total = round2(r.total + t); });
    bump(bySeller, o.sellerId, () => ({ sellerId: o.sellerId, sellerName: o.sellerName, localId: o.localId, sales: 0, total: 0 }), (r) => { r.sales += 1; r.total = round2(r.total + t); });
    for (const p of paymentsOf(o)) byMethod[p.methodId] = round2((byMethod[p.methodId] ?? 0) + p.amount);
    const factor = 1 - (o.totals?.lineDiscountPct ?? 0) / 100;
    for (const l of (o.lines ?? []).filter((x) => x.status !== 'eliminado')) {
      bump(products, l.sku, () => ({ sku: l.sku, name: l.name, qty: 0, total: 0 }), (r) => {
        r.qty += l.qty;
        r.total = round2(r.total + l.qty * l.basePrice * factor);
      });
    }
  }
  total = round2(total);
  const byTotal = (a, b) => b.total - a.total;
  return {
    sales: sold.length, total, net: netOfIva(total), averageTicket: sold.length ? round2(total / sold.length) : 0,
    byLocal: [...byLocal.values()].sort(byTotal), bySeller: [...bySeller.values()].sort(byTotal), byMethod,
    topProducts: [...products.values()].sort(byTotal).slice(0, 20),
  };
}
```

- [ ] **Step 4: Correr** — `node --test test/posStats.test.mjs` → PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/posStats.mjs backend/test/posStats.test.mjs
git commit -m "feat(pos): estadísticas por local, vendedor, medio de pago y producto"
```

---

### Task 13: Rutas `/api/pos` y arranque

**Files:**
- Create: `Reportes/backend/posRoutes.mjs`
- Modify: `Reportes/backend/posAuth.mjs` (agregar `assertOrderAccess`), `Reportes/backend/posOdoo.mjs` (agregar `listOdooOptions`), `Reportes/backend/index.mjs` (solo agregar imports, montaje y arranque).
- Test: `Reportes/backend/test/posRoutes.test.mjs`, `Reportes/backend/test/posAuth.test.mjs` (sumar casos)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces:
  - `assertOrderAccess(order, user)` (puro, en `posAuth.mjs`): vendedor → solo sus carritos; caja → pedidos de su local; admin → todo. Tira `status = 403`.
  - `actingUser(req, order) → { id, name, role, localId }` (admin opera con el local del pedido).
  - `listOdooOptions() → { warehouses, locations, teams, journals, pricelists, pickingTypes, tags }` para los desplegables del Admin.
  - Endpoints (todos devuelven JSON; errores `{ error }`):

| Método y ruta | Rol | Hace |
|---|---|---|
| `POST /auth/pin` `{ pin }` | — | login vendedor → `{ token, user }` |
| `POST /auth/login` `{ username, password }` | — | login caja/admin → `{ token, user }` |
| `GET /config` | todos | `{ locales, paymentMethods, promotions (motivo/auto activas, sin cupones), settings: { decoradorTagId } }` |
| `GET /products/search?q=&localId=` | todos | `[{ ...CatalogProduct, stock: StockView }]` (q ≥ 4 caracteres) |
| `GET /products/:templateId/image` | público | foto `image_256` (caché 1 día) |
| `GET /customers/lookup?doc=` | todos | `{ odoo: partner\|null, arca: persona\|null }` (ARCA en Task 14; acá `arca: null`) |
| `GET /carts` · `POST /carts` · `POST /carts/:id/lines` · `DELETE /carts/:id` · `POST /carts/:id/submit` | vendedor, caja | carrito propio |
| `PATCH /orders/:id/lines/:lineId` · `DELETE /orders/:id/lines/:lineId` · `POST /orders/:id/lines` | vendedor (su carrito), caja, admin | líneas |
| `GET /orders/queue?localId=` | caja, admin | cola del local |
| `GET /orders/:id` | según `assertOrderAccess` | pedido + `preview` (`priceOrder`) si está en borrador |
| `PATCH /orders/:id` | caja, admin | `updateDraft` |
| `POST /orders/:id/confirm` | caja, admin | `claimAndConfirmPos` |
| `POST /orders/:id/invoice` | caja, admin | reintenta la factura |
| `POST /orders/:id/annul` `{ reason }` | caja, admin | confirmado → `annulPosOrder`; pendiente/error sin Odoo → `markOrderAnnulled` |
| `GET /history?localId=&months=` | caja (su local), admin | `listOrdersByMonth` |
| `GET /cash/current?localId=` · `POST /cash/open` · `POST /cash/close` · `POST /cash/movements` · `POST /cash/movements/:id/void` · `PATCH /cash/notes` · `GET /cash/sessions?localId=` | caja, admin | caja del día |
| `GET /admin/options` | admin | `listOdooOptions` |
| `GET /admin/locales` · `PUT /admin/locales/:id` | admin | locales |
| `GET /admin/settings` · `PUT /admin/settings` | admin | ajustes |
| `GET /admin/payment-methods` · `PUT /admin/payment-methods/:id` | admin | medios de pago |
| `GET /admin/promotions` · `POST /admin/promotions` · `PUT /admin/promotions/:id` | admin | promociones |
| `GET /admin/users` · `POST /admin/users` · `PATCH /admin/users/:id` · `DELETE /admin/users/:id` | admin | usuarios |
| `GET /admin/stats?from=&to=&localId=` | admin | `computePosStats` |

- [ ] **Step 1: Test de acceso a pedidos** (Review Focus #3) — agregar a `test/posAuth.test.mjs`:

```js
const { assertOrderAccess } = await import('../posAuth.mjs');

test('assertOrderAccess: caja de LL no ve pedidos de AL; admin ve todo; vendedor solo sus carritos', () => {
  const al = { localId: 'AL', sellerId: 'v9', status: 'pendiente' };
  assert.throws(() => assertOrderAccess(al, { role: 'caja', localId: 'LL' }), (err) => err.status === 403);
  assert.doesNotThrow(() => assertOrderAccess(al, { role: 'caja', localId: 'AL' }));
  assert.doesNotThrow(() => assertOrderAccess(al, { role: 'admin' }));
  assert.throws(() => assertOrderAccess(al, { role: 'vendedor', id: 'v1', localId: 'AL' }), (err) => err.status === 403);
  assert.doesNotThrow(() => assertOrderAccess({ ...al, sellerId: 'v1', status: 'carrito' }, { role: 'vendedor', id: 'v1', localId: 'AL' }));
});
```

y en `posAuth.mjs`:

```js
export function assertOrderAccess(order, user) {
  if (isAdminRole(user.role)) return;
  if (user.role === 'vendedor') {
    if (order.sellerId !== user.id) throw forbidden('Ese pedido es de otro vendedor');
    return;
  }
  if (order.localId !== user.localId) throw forbidden('No tenés acceso a ese local');
}
```

- [ ] **Step 2: Test del router sin Firestore** (Review Focus #4) — `test/posRoutes.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

process.env.POS_AUTH_SECRET = 'test-secret-pos';
process.env.FERIA_AUTH_SECRET = 'test-secret-feria';
const { default: posRoutes } = await import('../posRoutes.mjs');
const feria = await import('../feriaAuth.mjs');
const { generateToken } = await import('../posAuth.mjs');

async function withServer(fn) {
  const app = express();
  app.use(express.json());
  app.use('/api/pos', posRoutes);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/pos`;
  try { await fn(base); } finally { server.close(); }
}

test('sin token → 401; token de la feria → 401', async () => {
  await withServer(async (base) => {
    assert.equal((await fetch(`${base}/orders/queue`)).status, 401);
    const feriaToken = feria.generateToken({ role: 'caja', id: 'x' });
    const res = await fetch(`${base}/orders/queue`, { headers: { Authorization: `Bearer ${feriaToken}` } });
    assert.equal(res.status, 401);
  });
});

test('vendedor no entra a rutas de admin ni de caja → 403', async () => {
  await withServer(async (base) => {
    const token = generateToken({ id: 'v1', role: 'vendedor', localId: 'LL', name: 'Ana' });
    const headers = { Authorization: `Bearer ${token}` };
    assert.equal((await fetch(`${base}/admin/users`, { headers })).status, 403);
    assert.equal((await fetch(`${base}/orders/queue`, { headers })).status, 403);
  });
});

test('búsqueda con menos de 4 letras → 400 sin tocar Odoo', async () => {
  await withServer(async (base) => {
    const token = generateToken({ id: 'v1', role: 'vendedor', localId: 'LL', name: 'Ana' });
    const res = await fetch(`${base}/products/search?q=ab`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(res.status, 400);
  });
});
```

- [ ] **Step 3: Correr y ver que falla** — `node --test test/posAuth.test.mjs test/posRoutes.test.mjs` → FAIL (`assertOrderAccess` y `posRoutes.mjs` no existen).

- [ ] **Step 4: `listOdooOptions` en `posOdoo.mjs`**

```js
// Opciones para los desplegables del Admin (solo lectura).
export async function listOdooOptions() {
  const read = (model, domain, fields) => callKwReadWithRetry(model, 'search_read', [domain], { fields });
  const [warehouses, locations, teams, journals, pricelists, pickingTypes, tags] = await Promise.all([
    read('stock.warehouse', [], ['id', 'name', 'code']),
    read('stock.location', [['usage', '=', 'internal']], ['id', 'complete_name']),
    read('crm.team', [], ['id', 'name']),
    read('account.journal', [['type', '=', 'sale']], ['id', 'name']),
    read('product.pricelist', [], ['id', 'name']),
    read('stock.picking.type', [['code', '=', 'outgoing']], ['id', 'name', 'warehouse_id']),
    read('res.partner.category', [], ['id', 'name']),
  ]);
  return { warehouses, locations, teams, journals, pricelists, pickingTypes, tags };
}
```

- [ ] **Step 5: Implementar `posRoutes.mjs`**

```js
import { Router } from 'express';
import {
  requirePosAuth, requirePosRole, generateToken, loginWithPin, loginWithPassword, scopeLocalId,
  assertOrderAccess, isAdminRole,
} from './posAuth.mjs';
import { listUsers, createUser, updateUser, deleteUser } from './posUsers.mjs';
import {
  getLocales, getSettings, getPaymentMethods, getPaymentMethodsById, saveLocale, saveSettings, savePaymentMethod, localeIdsOf,
} from './posConfig.mjs';
import { listPromotions, listActivePromotions, savePromotion } from './posPromotions.mjs';
import { searchCatalog, fetchFreeStock, groupStock, stockLocationIds } from './posCatalog.mjs';
import { readReservationsFor, appReservedFor } from './posStock.mjs';
import * as orders from './posOrders.mjs';
import { claimAndConfirmPos, annulPosOrder, invoicingEnabledFor } from './posConfirm.mjs';
import { findPartnerForLookup, listOdooOptions, findOrderInvoices, createInvoiceFromOrder, postInvoice } from './posOdoo.mjs';
import { invoiceOrder } from './feriaInvoice.mjs';
import * as cash from './posCash.mjs';
import { computePosStats, monthsBetween } from './posStats.mjs';
import { fetchProductImage } from './odoo.mjs';
import { getDb } from './firestore.mjs';

const router = Router();
const auth = [requirePosAuth];
const sellers = [requirePosAuth, requirePosRole('vendedor', 'caja', 'admin')];
const cajas = [requirePosAuth, requirePosRole('caja', 'admin')];
const admins = [requirePosAuth, requirePosRole('admin')];

const handle = (fn) => async (req, res) => {
  try {
    res.json(await fn(req, res));
  } catch (err) {
    const status = err.status ?? (err.stage === 'odoo' ? 502 : 400);
    if (status >= 500) console.error('[pos]', req.method, req.path, err.message);
    res.status(status).json({ error: err.message });
  }
};

// Admin opera sobre el local del pedido (o el que pide); el resto, el suyo.
function actingUser(req, localId) {
  const user = req.posUser;
  return isAdminRole(user.role) ? { ...user, localId } : user;
}

async function orderFor(req) {
  const order = await orders.getOrder(req.params.id);
  assertOrderAccess(order, req.posUser);
  return order;
}

// ---- Login ----
router.post('/auth/pin', handle(async (req, res) => {
  const user = await loginWithPin(req.body?.pin);
  if (!user) throw Object.assign(new Error('PIN incorrecto'), { status: 401 });
  return { token: generateToken(user), user };
}));

router.post('/auth/login', handle(async (req) => {
  const user = await loginWithPassword(req.body?.username, req.body?.password);
  if (!user) throw Object.assign(new Error('Usuario o contraseña incorrectos'), { status: 401 });
  return { token: generateToken(user), user };
}));

// ---- Configuración visible para todos ----
router.get('/config', ...auth, handle(async () => {
  const [locales, paymentMethods, promotions, settings] = await Promise.all([
    getLocales(), getPaymentMethods(), listActivePromotions(), getSettings(),
  ]);
  return {
    locales: locales.filter((l) => l.active !== false).map(({ id, name, address, invoiceJournalId }) => ({ id, name, address, invoices: Boolean(invoiceJournalId) })),
    paymentMethods: paymentMethods.filter((m) => m.active !== false),
    promotions: promotions.filter((p) => p.kind !== 'cupon').map(({ id, name, kind, type, value, requiresPaymentMethodId }) => ({ id, name, kind, type, value, requiresPaymentMethodId })),
    settings: { decoradorTagId: settings.decoradorTagId },
  };
}));

// ---- Productos ----
router.get('/products/search', ...sellers, handle(async (req) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 4) throw Object.assign(new Error('Escribí al menos 4 letras'), { status: 400 });
  const localId = scopeLocalId(req.posUser, req.query.localId) ?? req.query.localId;
  const [locales, settings] = await Promise.all([getLocales(), getSettings()]);
  const products = await searchCatalog(q, settings);
  const locationIds = stockLocationIds(locales, settings);
  const productIds = products.map((p) => p.productId);
  const [free, reserved] = await Promise.all([fetchFreeStock(productIds, locationIds), readReservationsFor(getDb(), productIds, locationIds)]);
  return products.map((p) => ({
    ...p,
    stock: groupStock({ freeByLoc: free.get(p.productId) ?? new Map(), appReserved: appReservedFor(reserved, p.productId), locales, settings, localId }),
  }));
}));

const images = new Map();
router.get('/products/:templateId/image', async (req, res) => {
  try {
    const id = Number(req.params.templateId);
    if (!id) return res.status(400).end();
    let image = images.get(id);
    if (!image) {
      image = await fetchProductImage(id, 'image_256');
      if (!image) return res.status(404).end();
      images.set(id, image);
      if (images.size > 800) images.delete(images.keys().next().value);
    }
    res.set('Content-Type', image.contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(image.buffer);
  } catch (err) {
    res.status(500).end();
  }
});

// ---- Clientes ----
router.get('/customers/lookup', ...sellers, handle(async (req) => {
  const doc = String(req.query.doc ?? '').replace(/\D/g, '');
  if (doc.length < 7) throw new Error('Escribí el DNI o CUIT completo');
  return { odoo: await findPartnerForLookup(doc), arca: null };
}));

// ---- Carritos ----
router.get('/carts', ...sellers, handle((req) => orders.listMyCarts(req.posUser)));
router.post('/carts', ...sellers, handle((req) => orders.createCart(actingUser(req, req.body?.localId ?? req.posUser.localId), req.body?.line ?? {})));
router.post('/carts/:id/lines', ...sellers, handle(async (req) => {
  await orderFor(req);
  return orders.addCartLine(req.params.id, req.posUser, req.body?.line ?? {});
}));
router.delete('/carts/:id', ...sellers, handle(async (req) => {
  await orderFor(req);
  return orders.discardCart(req.params.id, req.posUser);
}));
router.post('/carts/:id/submit', ...sellers, handle(async (req) => {
  await orderFor(req);
  return orders.submitCart(req.params.id, req.posUser, req.body ?? {});
}));

// ---- Líneas (carrito propio o pedido en caja) ----
router.post('/orders/:id/lines', ...cajas, handle(async (req) => {
  const order = await orderFor(req);
  return orders.addCartLine(req.params.id, actingUser(req, order.localId), req.body?.line ?? {});
}));
router.patch('/orders/:id/lines/:lineId', ...sellers, handle(async (req) => {
  const order = await orderFor(req);
  return orders.updateLine(req.params.id, actingUser(req, order.localId), req.params.lineId, req.body ?? {});
}));
router.delete('/orders/:id/lines/:lineId', ...sellers, handle(async (req) => {
  const order = await orderFor(req);
  return orders.removeLine(req.params.id, actingUser(req, order.localId), req.params.lineId);
}));

// ---- Caja: pedidos ----
router.get('/orders/queue', ...cajas, handle((req) => {
  const localId = scopeLocalId(req.posUser, req.query.localId);
  if (!localId) throw new Error('Elegí el local');
  return orders.listQueue(localId);
}));

router.get('/orders/:id', ...auth, handle(async (req) => {
  const order = await orderFor(req);
  if (!['pendiente', 'error', 'carrito'].includes(order.status)) return { order, preview: null };
  const [methodsById, promotions] = await Promise.all([getPaymentMethodsById(), listActivePromotions()]);
  let preview = null;
  try {
    preview = orders.priceOrder(order, { methodsById, promotions, now: Date.now() });
  } catch (err) {
    preview = { error: err.message };
  }
  return { order, preview };
}));

router.patch('/orders/:id', ...cajas, handle(async (req) => {
  const order = await orderFor(req);
  return orders.updateDraft(req.params.id, actingUser(req, order.localId), req.body ?? {});
}));

router.post('/orders/:id/confirm', ...cajas, handle(async (req) => {
  const order = await orderFor(req);
  return claimAndConfirmPos(req.params.id, actingUser(req, order.localId));
}));

router.post('/orders/:id/invoice', ...cajas, handle(async (req) => {
  const order = await orderFor(req);
  const locale = (await getLocales()).find((l) => l.id === order.localId);
  if (order.status !== 'confirmado' || !order.wantsInvoice) throw new Error('Este pedido no lleva factura');
  if (order.invoiceName) throw new Error(`Ya tiene la factura ${order.invoiceName}`);
  if (!invoicingEnabledFor(locale)) throw new Error('La facturación de este local no está habilitada');
  const result = await invoiceOrder(order, {
    journalId: locale.invoiceJournalId, findOrderInvoices, createInvoiceFromOrder, postInvoice,
    markOrderInvoiced: orders.markOrderInvoiced, setInvoiceError: orders.setInvoiceError,
  });
  if (result.status === 'error') throw new Error(result.error);
  return orders.getOrder(order.id);
}));

router.post('/orders/:id/annul', ...cajas, handle(async (req) => {
  const order = await orderFor(req);
  const user = actingUser(req, order.localId);
  if (order.status === 'confirmado') return annulPosOrder(order.id, user, req.body?.reason);
  orders.assertDraftEditable(order);
  return orders.markOrderAnnulled(order.id, user.name, req.body?.reason);
}));

router.get('/history', ...cajas, handle(async (req) => {
  const localId = scopeLocalId(req.posUser, req.query.localId);
  const localIds = localId ? [localId] : localeIdsOf(await getLocales());
  const months = String(req.query.months ?? '').split(',').filter((m) => /^\d{4}-\d{2}$/.test(m));
  if (!months.length) throw new Error('Elegí al menos un mes');
  return orders.listOrdersByMonth(localIds, months.slice(0, 6));
}));

// ---- Caja del día ----
const cashLocal = (req) => {
  const localId = scopeLocalId(req.posUser, req.query.localId ?? req.body?.localId);
  if (!localId) throw new Error('Elegí el local');
  return localId;
};
router.get('/cash/current', ...cajas, handle((req) => cash.getCurrentCash(cashLocal(req))));
router.post('/cash/open', ...cajas, handle((req) => cash.openCashSession({ localId: cashLocal(req), openingCash: req.body?.openingCash, user: req.posUser.name })));
router.post('/cash/close', ...cajas, handle((req) => cash.closeCashSession({ localId: cashLocal(req), countedCash: req.body?.countedCash, notes: req.body?.notes, user: req.posUser.name })));
router.post('/cash/movements', ...cajas, handle((req) => cash.addCashMovement(cashLocal(req), req.body ?? {}, req.posUser.name)));
router.post('/cash/movements/:movementId/void', ...cajas, handle((req) => cash.voidOpenCashMovement(cashLocal(req), req.params.movementId, req.posUser.name)));
router.patch('/cash/notes', ...cajas, handle((req) => cash.updateCashNotes(cashLocal(req), req.body?.notes)));
router.get('/cash/sessions', ...cajas, handle((req) => cash.listCashSessions(scopeLocalId(req.posUser, req.query.localId))));

// ---- Admin ----
router.get('/admin/options', ...admins, handle(() => listOdooOptions()));
router.get('/admin/locales', ...admins, handle(() => getLocales()));
router.put('/admin/locales/:id', ...admins, handle(async (req) => { await saveLocale(req.params.id, req.body ?? {}); return getLocales(); }));
router.get('/admin/settings', ...admins, handle(() => getSettings()));
router.put('/admin/settings', ...admins, handle(async (req) => { await saveSettings(req.body ?? {}); return getSettings(); }));
router.get('/admin/payment-methods', ...admins, handle(() => getPaymentMethods()));
router.put('/admin/payment-methods/:id', ...admins, handle(async (req) => { await savePaymentMethod(req.params.id, req.body ?? {}); return getPaymentMethods(); }));
router.get('/admin/promotions', ...admins, handle(() => listPromotions()));
router.post('/admin/promotions', ...admins, handle(async (req) => ({ id: await savePromotion(null, req.body ?? {}) })));
router.put('/admin/promotions/:id', ...admins, handle(async (req) => ({ id: await savePromotion(req.params.id, req.body ?? {}) })));
router.get('/admin/users', ...admins, handle(() => listUsers()));
router.post('/admin/users', ...admins, handle(async (req) => createUser(req.body ?? {}, req.posUser, localeIdsOf(await getLocales()))));
router.patch('/admin/users/:id', ...admins, handle(async (req) => updateUser(req.params.id, req.body ?? {}, req.posUser, localeIdsOf(await getLocales()))));
router.delete('/admin/users/:id', ...admins, handle((req) => deleteUser(req.params.id, req.posUser)));
router.get('/admin/stats', ...admins, handle(async (req) => {
  const from = new Date(req.query.from);
  const to = new Date(req.query.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) throw new Error('Rango de fechas inválido');
  const localIds = req.query.localId ? [req.query.localId] : localeIdsOf(await getLocales());
  const all = await orders.listOrdersByMonth(localIds, monthsBetween(from, to));
  return computePosStats(all, { from: from.getTime(), to: to.getTime() });
}));

export default router;
```

- [ ] **Step 6: Montar en `index.mjs`** — agregar SOLO estas líneas (no tocar las de la feria):

```js
// junto a los imports de la feria
import posRoutes from './posRoutes.mjs';
import { seedSuperadminIfNeeded } from './posAuth.mjs';
import { seedPosConfigIfNeeded } from './posConfig.mjs';
import { startPosAutoRetry } from './posConfirm.mjs';

// debajo de app.use('/api/feria', feriaRoutes);
app.use('/api/pos', posRoutes);

// dentro del if (process.argv[1] === ...) { ... }, después de seedCajaAdminIfNeeded
  startPosAutoRetry();
  seedPosConfigIfNeeded().catch(err => console.error('[pos] Error cargando configuración inicial:', err.message));
  seedSuperadminIfNeeded().catch(err => console.error('[pos] Error creando superadmin:', err.message));
```

- [ ] **Step 7: Correr** — `node --test test/posAuth.test.mjs test/posRoutes.test.mjs` → PASS. `npm test` → verde.

- [ ] **Step 8: Prueba local de humo** — en `.env` local agregar `POS_AUTH_SECRET` (32+ caracteres al azar), `POS_SUPERADMIN_USERNAME`, `POS_SUPERADMIN_INITIAL_PASSWORD`, `POS_SUPERADMIN_NAME`. Arrancar `npm run dev`; con curl: `POST /api/pos/auth/login` con el superadmin → token; `GET /api/pos/config` → 3 locales y 5 medios de pago; `GET /api/pos/products/search?q=QUEENS&localId=LL` → productos con `stock`. Verificar que `/api/feria/auth/users` sigue respondiendo igual que antes.

- [ ] **Step 9: Commit**

```bash
git add backend/posRoutes.mjs backend/posAuth.mjs backend/posOdoo.mjs backend/index.mjs backend/test/posAuth.test.mjs backend/test/posRoutes.test.mjs
git commit -m "feat(pos): rutas /api/pos, seeds y reintento automático"
```

---

### Task 14: Padrón de ARCA (CUIT → datos para facturar)

**Prerrequisito (trámite del dueño, no de código):** certificado digital de ARCA para el CUIT de la empresa con el servicio **"ws_sr_constancia_inscripcion"** (Constancia de Inscripción) asociado. Pasos: generar clave privada y CSR (`openssl genrsa -out arca.key 2048` y `openssl req -new -key arca.key -subj "/C=AR/O=Alto Rancho/CN=pos-locales/serialNumber=CUIT <cuit>" -out arca.csr`), subir el CSR en ARCA → "Administración de Certificados Digitales", descargar el `.crt`, y en "Administrador de Relaciones de Clave Fiscal" asociar el servicio al certificado. Sin esto, el código queda apagado y el lookup devuelve `arca: null` (carga manual, como hoy).

**Files:**
- Create: `Reportes/backend/posArca.mjs`
- Modify: `Reportes/backend/posRoutes.mjs` (lookup), `Reportes/backend/package.json` (dependencia `node-forge`)
- Test: `Reportes/backend/test/posArca.test.mjs`

**Interfaces:**
- Produces:
  - Puras: `buildTra(service, now) → xml`, `parseLoginResponse(xml) → { token, sign, expiresAt }`, `parsePersona(xml) → { cuit, name, afipResponsibility, street, city, zip, province } | null`, `cuitCandidatesFromDni(dni) → string[]`.
  - E/S: `arcaEnabled() → boolean`, `getPersona(cuit) → persona|null`, `lookupArca(doc) → persona|null` (CUIT directo; DNI → prueba CUIL 20/27/23/24).
  - Variables: `POS_ARCA_CUIT`, `POS_ARCA_CERT` (PEM), `POS_ARCA_KEY` (PEM), `POS_ARCA_ENV` (`prod` | `homo`).

- [ ] **Step 1: Agregar la dependencia** — `cd Reportes/backend && npm install node-forge@^1.3.1`. Verificar que `package.json` y `package-lock.json` cambiaron solo en eso.

- [ ] **Step 2: Test**

```js
// test/posArca.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTra, parseLoginResponse, parsePersona, cuitCandidatesFromDni } from '../posArca.mjs';

test('buildTra: pide el servicio con ventana de ±10 minutos', () => {
  const xml = buildTra('ws_sr_constancia_inscripcion', new Date('2026-10-13T15:00:00Z'));
  assert.match(xml, /<service>ws_sr_constancia_inscripcion<\/service>/);
  assert.match(xml, /<generationTime>2026-10-13T14:50:00.000Z<\/generationTime>/);
  assert.match(xml, /<expirationTime>2026-10-13T15:10:00.000Z<\/expirationTime>/);
});

test('parseLoginResponse: saca token y sign del XML escapado', () => {
  const inner = '<loginTicketResponse><header><expirationTime>2026-10-14T03:00:00.000-03:00</expirationTime></header><credentials><token>TOK</token><sign>SIG</sign></credentials></loginTicketResponse>';
  const escaped = inner.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const xml = `<soapenv:Envelope><soapenv:Body><loginCmsResponse><loginCmsReturn>${escaped}</loginCmsReturn></loginCmsResponse></soapenv:Body></soapenv:Envelope>`;
  const r = parseLoginResponse(xml);
  assert.equal(r.token, 'TOK');
  assert.equal(r.sign, 'SIG');
  assert.equal(r.expiresAt, new Date('2026-10-14T03:00:00.000-03:00').getTime());
});

test('parsePersona: responsable inscripto con domicilio fiscal', () => {
  const xml = `<personaReturn><datosGenerales><idPersona>30712345671</idPersona><razonSocial>MUEBLES SA</razonSocial>
    <domicilioFiscal><direccion>AV SIEMPREVIVA 742</direccion><localidad>CIUDAD AUTONOMA BUENOS AIRES</localidad><codPostal>1428</codPostal><descripcionProvincia>CIUDAD AUTONOMA BUENOS AIRES</descripcionProvincia></domicilioFiscal>
    </datosGenerales><datosRegimenGeneral><impuesto><idImpuesto>30</idImpuesto></impuesto></datosRegimenGeneral></personaReturn>`;
  assert.deepEqual(parsePersona(xml), {
    cuit: '30712345671', name: 'MUEBLES SA', afipResponsibility: 'responsable_inscripto',
    street: 'AV SIEMPREVIVA 742', city: 'CIUDAD AUTONOMA BUENOS AIRES', zip: '1428', province: 'CIUDAD AUTONOMA BUENOS AIRES',
  });
});

test('parsePersona: monotributo y persona física (apellido + nombre); error → null', () => {
  const mono = `<personaReturn><datosGenerales><idPersona>20301234561</idPersona><apellido>PEREZ</apellido><nombre>ANA</nombre></datosGenerales><datosMonotributo><categoriaMonotributo>x</categoriaMonotributo></datosMonotributo></personaReturn>`;
  assert.equal(parsePersona(mono).name, 'PEREZ ANA');
  assert.equal(parsePersona(mono).afipResponsibility, 'monotributo');
  assert.equal(parsePersona('<personaReturn><errorConstancia><error>No existe</error></errorConstancia></personaReturn>'), null);
});

test('cuitCandidatesFromDni: prefijos 20, 27, 23, 24 con dígito verificador', () => {
  const c = cuitCandidatesFromDni('30123456');
  assert.equal(c.length, 4);
  assert.ok(c.every((x) => /^\d{11}$/.test(x)));
  assert.ok(c[0].startsWith('2030123456'));
});
```

- [ ] **Step 3: Correr y ver que falla** — `node --test test/posArca.test.mjs` → FAIL.

- [ ] **Step 4: Implementar `posArca.mjs`**

```js
// Consulta al padrón de ARCA (Constancia de Inscripción, A5) para completar
// los datos de Factura A desde el CUIT. Autenticación WSAA: un TRA firmado
// (CMS) con el certificado de la empresa → token + sign válidos ~12 h. El
// ticket se guarda en Firestore porque WSAA rechaza pedir otro mientras el
// anterior siga vigente (aunque se haya reiniciado el servidor).
import forge from 'node-forge';
import { getDb } from './firestore.mjs';
import { isValidCuit } from './feriaOdoo.mjs';

const SERVICE = 'ws_sr_constancia_inscripcion';
const URLS = {
  prod: { wsaa: 'https://wsaa.afip.gov.ar/ws/services/LoginCms', padron: 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5' },
  homo: { wsaa: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms', padron: 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5' },
};
const TA_REF = () => getDb().collection('pos_settings').doc('arcaTicket');

export function arcaEnabled() {
  return Boolean(process.env.POS_ARCA_CUIT && process.env.POS_ARCA_CERT && process.env.POS_ARCA_KEY);
}
const urls = () => URLS[process.env.POS_ARCA_ENV === 'homo' ? 'homo' : 'prod'];

export function buildTra(service, now = new Date()) {
  const gen = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
  const exp = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header><uniqueId>${Math.floor(now.getTime() / 1000)}</uniqueId><generationTime>${gen}</generationTime><expirationTime>${exp}</expirationTime></header><service>${service}</service></loginTicketRequest>`;
}

function signTra(tra) {
  const cert = forge.pki.certificateFromPem(process.env.POS_ARCA_CERT.replace(/\\n/g, '\n'));
  const key = forge.pki.privateKeyFromPem(process.env.POS_ARCA_KEY.replace(/\\n/g, '\n'));
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(tra, 'utf8');
  p7.addCertificate(cert);
  p7.addSigner({
    key, certificate: cert, digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });
  p7.sign();
  return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
}

const tag = (xml, name) => xml.match(new RegExp(`<(?:\\w+:)?${name}>([\\s\\S]*?)</(?:\\w+:)?${name}>`))?.[1]?.trim() ?? null;
const unescapeXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

export function parseLoginResponse(xml) {
  const inner = unescapeXml(tag(xml, 'loginCmsReturn') ?? '');
  const token = tag(inner, 'token');
  const sign = tag(inner, 'sign');
  if (!token || !sign) throw new Error(`ARCA no devolvió el ticket de acceso: ${tag(xml, 'faultstring') ?? 'respuesta inválida'}`);
  return { token, sign, expiresAt: new Date(tag(inner, 'expirationTime')).getTime() };
}

async function soap(url, body, action = '') {
  const res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: action },
    body, signal: AbortSignal.timeout(20_000),
  });
  return res.text();
}

async function getTicket() {
  const saved = (await TA_REF().get()).data();
  if (saved && saved.expiresAt - Date.now() > 5 * 60 * 1000) return saved;
  const cms = signTra(buildTra(SERVICE));
  const xml = await soap(urls().wsaa, `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov"><soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>`);
  const ticket = parseLoginResponse(xml);
  await TA_REF().set(ticket);
  return ticket;
}

export function parsePersona(xml) {
  if (tag(xml, 'errorConstancia') && !tag(xml, 'datosGenerales')) return null;
  const general = tag(xml, 'datosGenerales');
  if (!general) return null;
  const name = tag(general, 'razonSocial') ?? [tag(general, 'apellido'), tag(general, 'nombre')].filter(Boolean).join(' ');
  const domicilio = tag(general, 'domicilioFiscal') ?? '';
  const impuestos = [...(tag(xml, 'datosRegimenGeneral') ?? '').matchAll(/<idImpuesto>(\d+)<\/idImpuesto>/g)].map((m) => Number(m[1]));
  let afipResponsibility = 'consumidor_final';
  if (tag(xml, 'datosMonotributo')) afipResponsibility = 'monotributo';
  else if (impuestos.includes(30)) afipResponsibility = 'responsable_inscripto';
  else if (impuestos.includes(32)) afipResponsibility = 'exento';
  return {
    cuit: tag(general, 'idPersona'), name, afipResponsibility,
    street: tag(domicilio, 'direccion') ?? '', city: tag(domicilio, 'localidad') ?? '',
    zip: tag(domicilio, 'codPostal') ?? '', province: tag(domicilio, 'descripcionProvincia') ?? '',
  };
}

export async function getPersona(cuit) {
  const { token, sign } = await getTicket();
  const xml = await soap(urls().padron, `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:a5="http://a5.soap.ws.server.puc.sr/"><soapenv:Header/><soapenv:Body><a5:getPersona_v2><token>${token}</token><sign>${sign}</sign><cuitRepresentada>${process.env.POS_ARCA_CUIT}</cuitRepresentada><idPersona>${cuit}</idPersona></a5:getPersona_v2></soapenv:Body></soapenv:Envelope>`);
  return parsePersona(xml);
}

export function cuitCandidatesFromDni(dni) {
  const body = String(dni).replace(/\D/g, '').padStart(8, '0');
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  return ['20', '27', '23', '24'].map((prefix) => {
    const base = `${prefix}${body}`;
    const sum = weights.reduce((s, w, i) => s + w * Number(base[i]), 0);
    const mod = 11 - (sum % 11);
    return `${base}${mod === 11 ? 0 : mod === 10 ? 9 : mod}`;
  }).filter(isValidCuit);
}

export async function lookupArca(doc) {
  if (!arcaEnabled()) return null;
  const digits = String(doc).replace(/\D/g, '');
  if (digits.length === 11) return isValidCuit(digits) ? getPersona(digits) : null;
  if (digits.length < 7 || digits.length > 8) return null;
  for (const cuit of cuitCandidatesFromDni(digits)) {
    const persona = await getPersona(cuit);
    if (persona) return persona;
  }
  return null;
}
```

- [ ] **Step 5: Usarlo en el lookup** — en `posRoutes.mjs` importar `lookupArca` y reemplazar el handler de `/customers/lookup` por:

```js
router.get('/customers/lookup', ...sellers, handle(async (req) => {
  const doc = String(req.query.doc ?? '').replace(/\D/g, '');
  if (doc.length < 7) throw new Error('Escribí el DNI o CUIT completo');
  const odoo = await findPartnerForLookup(doc);
  // ARCA no frena la venta: si falla, se carga a mano.
  let arca = null;
  let arcaError = null;
  if (doc.length === 11 || !odoo) {
    try {
      arca = await lookupArca(doc);
    } catch (err) {
      arcaError = `No se pudo consultar ARCA: ${err.message}`;
    }
  }
  return { odoo, arca, arcaError };
}));
```

- [ ] **Step 6: Correr** — `node --test test/posArca.test.mjs` → PASS (5 tests). `npm test` → verde.

- [ ] **Step 7: Prueba real (cuando el certificado exista)** — con las variables en `.env` local y `POS_ARCA_ENV=prod`, `GET /api/pos/customers/lookup?doc=<CUIT de la empresa>` → devuelve la razón social correcta. Anotar el resultado en el documento de spikes.

- [ ] **Step 8: Commit**

```bash
git add backend/posArca.mjs backend/posRoutes.mjs backend/package.json backend/package-lock.json backend/test/posArca.test.mjs
git commit -m "feat(pos): datos del cliente desde el padrón de ARCA"
```

---

### Task 15: Ventas del POS en el dashboard de Reportes

Hoy `sync/locales.mjs` lee `pos.order` (Punto de Venta de Odoo). Las ventas nuevas van a ser `sale.order` de los equipos de cada local, así que el dashboard dejaría de verlas.

**Files:**
- Create: `Reportes/backend/sync/posLocales.mjs`
- Modify: `Reportes/backend/index.mjs` (una línea en `runFullSync`)
- Test: `Reportes/backend/test/posLocalesSync.test.mjs`

**Interfaces:**
- Consumes: `normalizeOdooSaleOrder` (`normalize.mjs`), `saveSalesDocs`, `getSyncMetadata`, `setSyncMetadata` (`firestore.mjs`), `fetchAll`, `callKw`, `chunk`, `authenticate` (`odoo.mjs`).
- Produces: `POS_STORES = [{ teamId: 6, prefix: 'LL-', channel: 'local_lomas' }, { teamId: 18, prefix: 'BL-', channel: 'local_belgrano' }, { teamId: 25, prefix: 'AL-', channel: 'local_alcorta' }]`, `posDocId(channel, orderId) → '<channel>_so_<id>'`, `syncPosLocales(categoryBySku, sinceOverride)`.

- [ ] **Step 1: Test**

```js
// test/posLocalesSync.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { posDocId, POS_STORES, toPosDoc } from '../sync/posLocales.mjs';

test('posDocId: no choca con los ids de pos.order del mismo canal', () => {
  assert.equal(posDocId('local_lomas', 123), 'local_lomas_so_123');
});

test('POS_STORES: un canal por local con su prefijo de número interno', () => {
  assert.deepEqual(POS_STORES.map((s) => s.channel), ['local_lomas', 'local_belgrano', 'local_alcorta']);
});

test('toPosDoc: normaliza un sale.order al formato del dashboard con id propio', () => {
  const doc = toPosDoc(
    { id: 9, date_order: '2026-10-13 15:00:00', amount_total: 1210, state: 'sale' },
    [{ product_id: [10, '[QUE001] Cajonera Queens'], product_uom_qty: 1, price_unit: 1000 }],
    'local_lomas', new Map([['QUE001', 'Cajoneras']]),
  );
  assert.equal(doc.id, 'local_lomas_so_9');
  assert.equal(doc.channel, 'local_lomas');
  assert.equal(doc.status, 'completed');
  assert.equal(doc.items[0].sku, 'QUE001');
});
```

- [ ] **Step 2: Correr y ver que falla** — `node --test test/posLocalesSync.test.mjs` → FAIL.

- [ ] **Step 3: Implementar `sync/posLocales.mjs`**

```js
// Ventas del POS propio de locales (sale.order con número interno LL-/BL-/AL-
// en client_order_ref) a los mismos canales del dashboard que las del Punto
// de Venta de Odoo (sync/locales.mjs, que sigue sumando las ventas viejas).
import { authenticate, callKw, fetchAll, chunk } from '../odoo.mjs';
import { normalizeOdooSaleOrder } from '../normalize.mjs';
import { saveSalesDocs, getSyncMetadata, setSyncMetadata } from '../firestore.mjs';

export const POS_STORES = [
  { teamId: 6, prefix: 'LL-', channel: 'local_lomas' },
  { teamId: 18, prefix: 'BL-', channel: 'local_belgrano' },
  { teamId: 25, prefix: 'AL-', channel: 'local_alcorta' },
];
const CHUNK_SIZE = 2000;

export const posDocId = (channel, orderId) => `${channel}_so_${orderId}`;

export function toPosDoc(order, lines, channel, categoryBySku) {
  const doc = normalizeOdooSaleOrder(order, lines, categoryBySku, { channel });
  return { ...doc, id: posDocId(channel, order.id) };
}

export async function syncPosLocales(categoryBySku, sinceOverride) {
  await authenticate();
  const results = {};
  for (const store of POS_STORES) {
    const metaKey = `${store.channel}_pos`;
    const meta = await getSyncMetadata(metaKey);
    const since = sinceOverride || meta?.lastSyncedAt?.slice(0, 19).replace('T', ' ') || '2000-01-01 00:00:00';
    const orders = await fetchAll('sale.order', [
      ['team_id', '=', store.teamId], ['client_order_ref', '=like', `${store.prefix}%`], ['write_date', '>=', since],
    ], ['id', 'date_order', 'amount_total', 'state', 'order_line']);
    const linesByOrderId = new Map();
    for (const ids of chunk(orders.flatMap((o) => o.order_line), CHUNK_SIZE)) {
      const lines = await callKw('sale.order.line', 'read', [ids], { fields: ['order_id', 'product_id', 'product_uom_qty', 'price_unit'] });
      for (const line of lines) {
        if (!line.product_id) continue;
        const id = line.order_id[0];
        if (!linesByOrderId.has(id)) linesByOrderId.set(id, []);
        linesByOrderId.get(id).push(line);
      }
    }
    const docs = orders.map((o) => toPosDoc(o, linesByOrderId.get(o.id) || [], store.channel, categoryBySku));
    await saveSalesDocs(docs);
    await setSyncMetadata(metaKey, { lastSyncedAt: new Date().toISOString(), count: docs.length });
    results[store.channel] = docs.length;
    console.log(`[sync:posLocales] ${store.channel}: ${docs.length} pedidos`);
  }
  return results;
}
```

- [ ] **Step 4: Registrar en `index.mjs`** — importar `syncPosLocales` y agregar `await syncPosLocales(categoryBySku);` en `runFullSync` justo después de `await syncLocales(categoryBySku);`.

- [ ] **Step 5: Correr** — `node --test test/posLocalesSync.test.mjs` → PASS. `npm test` → verde.

- [ ] **Step 6: Commit**

```bash
git add backend/sync/posLocales.mjs backend/index.mjs backend/test/posLocalesSync.test.mjs
git commit -m "feat(reportes): sumar al dashboard las ventas del POS de locales"
```

---

## Frontend

Convenciones para las Tasks 16–19 (repo `punto-venta-altorancho/client`):

- No hay tests de front en este repo (la feria tampoco tenía). Cada tarea se verifica con: `npm run build` (y **comprobar que `dist/assets/*.js` existe**: bajo el lock de Dropbox, `vite build` puede terminar "bien" con `dist/assets` vacío), un lint de identificadores no definidos, y una prueba manual en el navegador contra el backend local (`VITE_API_URL=http://localhost:3000 npm run dev`).
- Lint: `vite build` no detecta variables sin definir. Una vez, en Task 16, crear en el scratchpad de la sesión una carpeta `lint/` con `npm init -y && npm i eslint@8 eslint-plugin-react@7` y un `.eslintrc.json` `{ "parserOptions": { "ecmaVersion": 2022, "sourceType": "module", "ecmaFeatures": { "jsx": true } }, "plugins": ["react"], "rules": { "no-undef": "error", "react/jsx-no-undef": "error", "react/jsx-uses-vars": "error", "no-unused-vars": "warn" }, "env": { "browser": true, "es2022": true } }`. Correr con `npx eslint --no-eslintrc -c <scratchpad>/lint/.eslintrc.json "<repo>/client/src/**/*.jsx" "<repo>/client/src/**/*.js"` (desde `<scratchpad>/lint`). Debe dar 0 errores.
- Reusar el sistema visual existente (`styles/global.css`: variables `--ink`, `--paper`, `--line`, clases `btn`, `btn-primary`, `input`, `card`…) y los componentes de `components/ui.jsx` que sigan sirviendo (`Notice`, `EmptyState`, `LoginShell`, `Chip`).
- Vendedor: objetivos táctiles ≥ 44 px e inputs ≥ 16 px en celular; acción principal fija abajo.
- Caja y Admin: escritorio (≥ 1280 px), menú lateral izquierdo de 232 px.

### Task 16: Limpieza, marca, sesiones y estructura de navegación

**Files:**
- Delete: `src/pages/FeriaPublico.jsx`, `src/pages/FeriaPublico.module.css`, `src/pages/LogisticaPanel.jsx`, `src/components/EntregasView.*`, `src/components/CancelledItems.*`, `src/components/StockAlertsView.*`, `src/components/LabelsView.*`, `src/components/AddLabelButton.jsx`, `src/components/VariosForm.jsx`, `src/lib/feriaLabels.js`, `src/lib/labelQueue.js`, `src/lib/zebraLabels.js`, `src/lib/zebraLabels.css`
- Modify: `client/package.json` (nombre `punto-venta-altorancho-client`, quitar `jsbarcode`), `client/index.html` (título "Alto Rancho · Punto de venta"), `src/styles/global.css` (comentario de cabecera; quitar variables `--falla*` / `--disc*` y `.cond-*`), `src/lib/session.js`, `src/lib/api.js`, `src/components/ui.jsx`, `src/App.jsx`, `src/pages/VendedorLogin.jsx`, `README.md`, `PRODUCT.md`
- Create: `src/lib/labels.js`, `src/components/SidebarShell.jsx`, `src/components/SidebarShell.module.css`, `src/pages/StaffLogin.jsx`
- Las páginas `VendedorPanel.jsx` y `CajaPanel.jsx` quedan momentáneamente como placeholders que solo dicen "En construcción" (se reescriben en Tasks 17 y 18); `CashView`, `HistoryView`, `StatsView`, `UsersView`, `ProductLookupView`, `OrderLines`, `SplitPayment`, `ShippingForm`, `AddProductSearch` se conservan como referencia hasta que la tarea que los reemplaza los borre.

- [ ] **Step 1: Borrar lo que no se usa** — `git rm` de la lista de arriba. `npm uninstall jsbarcode`.

- [ ] **Step 2: `src/lib/session.js`**

```js
// Una sesión por panel (vendedor, caja, admin): entrar a Caja en otra
// pestaña no pisa la sesión del vendedor. Las rutas van con hash: /#/caja.
export function roleForRoute() {
  const hash = window.location.hash;
  if (hash.startsWith('#/vendedor')) return 'vendedor';
  if (hash.startsWith('#/admin')) return 'admin';
  return 'caja';
}

const key = (role) => `pos_session_${role}`;

export function getSession(role = roleForRoute()) {
  try {
    return JSON.parse(localStorage.getItem(key(role))) ?? null;
  } catch {
    return null;
  }
}

export function saveSession(role, token, user) {
  localStorage.setItem(key(role), JSON.stringify({ token, user }));
}

export function clearSession(role = roleForRoute()) {
  localStorage.removeItem(key(role));
}
```

- [ ] **Step 3: `src/lib/api.js`**

```js
import { getSession, clearSession, roleForRoute } from './session.js';

export const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API = `${BASE_URL}/api/pos`;

export async function api(path, { method = 'GET', body } = {}) {
  const role = roleForRoute();
  const token = getSession(role)?.token;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  // Sesión vencida (12 h): volver al login. Los logins devuelven 401 con
  // PIN/contraseña mal: ahí no se recarga, para que se vea el error.
  if (res.status === 401 && token && !path.startsWith('/auth/')) {
    clearSession(role);
    window.location.reload();
  }
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

export const productImageUrl = (templateId) => `${API}/products/${templateId}/image`;
```

- [ ] **Step 4: `src/lib/labels.js`**

```js
export const DELIVERY_LABELS = {
  ahora: 'Se lo lleva ahora', retira_local: 'Retira otro día en el local', envio: 'Envío a domicilio',
  retira_rolon: 'Retira en Rolón', retira_otro_local: 'Retira en otro local',
};
export const ORIGIN_LABELS = { stock: 'Stock del local', exhibicion: 'Exhibición', rolon: 'Rolón' };
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
```

- [ ] **Step 5: Ajustar `src/components/ui.jsx`** — quitar los imports de `feriaLabels`, `ConditionChip`, `PaymentChip(s)`, `LineStatusChip`, `OrderNumbers`; `OrderStatusChip` pasa a usar `ORDER_STATUS` de `labels.js`; `ProductPhoto` recibe `templateId` en vez de `sku` y usa `productImageUrl(templateId)`; `logout()` sigue igual. `AppHeader` queda solo para el panel Vendedor (sin pestañas).

- [ ] **Step 6: `src/components/SidebarShell.jsx`**

```jsx
import logoAlto from '../assets/logo-alto.png';
import { logout } from './ui.jsx';
import styles from './SidebarShell.module.css';

// Layout de escritorio de Caja y Admin: menú a la izquierda, contenido a la
// derecha. `items`: [{ value, label, badge? }].
export default function SidebarShell({ panel, subtitle, userName, items, active, onSelect, children }) {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <img src={logoAlto} alt="Alto Rancho" className={styles.logo} />
          <div>
            <p className={styles.panel}>{panel}.</p>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
        </div>
        <nav className={styles.nav} aria-label="Secciones">
          {items.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`${styles.item} ${active === item.value ? styles.itemActive : ''}`}
              aria-current={active === item.value ? 'page' : undefined}
              onClick={() => onSelect(item.value)}
            >
              <span>{item.label}</span>
              {item.badge ? <span className={styles.badge}>{item.badge}</span> : null}
            </button>
          ))}
        </nav>
        <div className={styles.footer}>
          <span className={styles.user}>{userName}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>Salir</button>
        </div>
      </aside>
      <main className={styles.content}>{children}</main>
    </div>
  );
}
```

```css
/* SidebarShell.module.css */
.shell { display: grid; grid-template-columns: 232px 1fr; min-height: 100vh; background: var(--wash); }
.sidebar { position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column; gap: 24px; padding: 20px 14px; background: var(--paper); border-right: 1px solid var(--line); }
.brand { display: flex; align-items: center; gap: 10px; padding: 0 6px; }
.logo { height: 28px; }
.panel { margin: 0; font-weight: 600; font-size: 18px; color: var(--ink); }
.subtitle { margin: 0; font-size: 13px; color: var(--ink-3); }
.nav { display: flex; flex-direction: column; gap: 2px; flex: 1; overflow-y: auto; }
.item { display: flex; justify-content: space-between; align-items: center; min-height: 40px; padding: 8px 12px; border: 0; border-radius: 8px; background: transparent; color: var(--ink-2); font: inherit; font-size: 15px; text-align: left; cursor: pointer; }
.item:hover { background: var(--wash); color: var(--ink); }
.itemActive { background: var(--ink); color: var(--paper); }
.itemActive:hover { background: var(--ink); color: var(--paper); }
.badge { min-width: 22px; padding: 1px 7px; border-radius: 999px; background: var(--pending-bg); color: var(--pending); font-size: 12px; font-weight: 600; text-align: center; }
.footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 6px 0; border-top: 1px solid var(--line); }
.user { font-size: 13px; color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.content { padding: 28px 32px; min-width: 0; }
```

- [ ] **Step 7: Logins** — `VendedorLogin.jsx`: igual que hoy pero `api('/auth/pin', { method: 'POST', body: { pin } })` → `saveSession('vendedor', token, user)`, título `"vendedor."`, hint "Ingresá tu PIN.". Crear `StaffLogin.jsx` (reemplaza a `CajaLogin.jsx`, que se borra):

```jsx
import { useState } from 'react';
import { api } from '../lib/api.js';
import { saveSession } from '../lib/session.js';
import { LoginShell, Notice } from '../components/ui.jsx';

// Login de caja y admin con usuario y contraseña. `role` define qué sesión
// guarda; el backend rechaza si el usuario no tiene ese rol al usar el panel.
export default function StaffLogin({ role }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token, user } = await api('/auth/login', { method: 'POST', body: { username, password } });
      const allowed = role === 'admin' ? ['admin', 'superadmin'] : ['caja', 'admin', 'superadmin'];
      if (!allowed.includes(user.role)) throw new Error(role === 'admin' ? 'Tu usuario no es de administración' : 'Tu usuario no es de caja');
      saveSession(role, token, user);
      window.location.reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <LoginShell title={`${role}.`} hint="Ingresá tu usuario y contraseña." onSubmit={handleSubmit}>
      <input className="input" autoComplete="username" placeholder="Usuario" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
      <input className="input" type="password" autoComplete="current-password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} />
      <Notice kind="error">{error}</Notice>
      <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={loading || !username || !password}>
        {loading ? 'Entrando…' : 'Entrar'}
      </button>
    </LoginShell>
  );
}
```

- [ ] **Step 8: `src/App.jsx`**

```jsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { getSession } from './lib/session.js';
import VendedorLogin from './pages/VendedorLogin.jsx';
import VendedorPanel from './pages/VendedorPanel.jsx';
import StaffLogin from './pages/StaffLogin.jsx';
import CajaPanel from './pages/caja/CajaPanel.jsx';
import AdminPanel from './pages/admin/AdminPanel.jsx';

const hasSession = (role) => Boolean(getSession(role)?.token);

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/caja" replace />} />
      <Route path="/vendedor" element={hasSession('vendedor') ? <VendedorPanel /> : <VendedorLogin />} />
      <Route path="/caja" element={hasSession('caja') ? <CajaPanel /> : <StaffLogin role="caja" />} />
      <Route path="/admin" element={hasSession('admin') ? <AdminPanel /> : <StaffLogin role="admin" />} />
    </Routes>
  );
}
```

Crear `src/pages/caja/CajaPanel.jsx` y `src/pages/admin/AdminPanel.jsx` mínimos que monten `SidebarShell` con los ítems de sus tareas y un `EmptyState title="En construcción"`; mover/borrar el viejo `pages/CajaPanel.jsx` y `CajaLogin.jsx`.

- [ ] **Step 9: Textos de marca** — `README.md`: qué es el POS, cómo correrlo (`npm install`, `VITE_API_URL`, `npm run dev`, `npm run build`), rutas `/#/vendedor`, `/#/caja`, `/#/admin`. `PRODUCT.md`: actualizar Users (vendedores en tablet/celular en el salón; caja en escritorio; admin = facturación, directivos, dueño), Product Purpose (vender en los locales sin pasos que se olviden, con stock de todos los depósitos y facturación automática), Design Principles (mobile-first vendedor, desktop con menú lateral en caja/admin). Sacar toda mención a la feria.

- [ ] **Step 10: Verificar** — `npm run build` → OK y `ls client/dist/assets/*.js` lista archivos; lint → 0 errores; `grep -ri "feria" client/src` → sin resultados; en el navegador: `/#/vendedor` muestra el login con PIN, `/#/caja` y `/#/admin` el login con usuario; con el superadmin de Task 13 se entra a `/#/admin` y se ve el menú lateral.

- [ ] **Step 11: Commit**

```bash
cd punto-venta-altorancho
git add -A client README.md PRODUCT.md
git commit -m "feat: base del POS de locales — marca, sesiones por panel y menú lateral"
```

---

### Task 17: Panel Vendedor (tablet y celular)

**Files:**
- Create: `src/pages/VendedorPanel.jsx` (reescrito), `src/pages/VendedorPanel.module.css` (reescrito), `src/components/ProductSearch.jsx` + `.module.css`, `src/components/StockBadges.jsx` + `.module.css`, `src/components/LineEditor.jsx` + `.module.css`, `src/components/CustomerForm.jsx` + `.module.css`, `src/components/ShippingFields.jsx`
- Delete: `src/components/AddProductSearch.*`, `src/components/ShippingForm.*` (reemplazados)

**Interfaces (API usada):** `GET /config`, `GET /products/search?q=`, `GET /carts`, `POST /carts { line }`, `POST /carts/:id/lines { line }`, `PATCH /orders/:id/lines/:lineId`, `DELETE /orders/:id/lines/:lineId`, `DELETE /carts/:id`, `POST /carts/:id/submit { customer, shipping }`, `GET /customers/lookup?doc=`.
- `line` = `{ productId, qty, origin, delivery, pickupLocalId }`.
- Respuesta de búsqueda: `[{ productId, templateId, sku, name, fullPrice, promoPrice, basePrice, stock: { local: { stock, exhibicion }, rolon, web: { qty, unlimited }, otros: [{ localId, name, qty }] } }]`.

Comportamiento (de esto salen las pruebas manuales del Step 7):
1. Arriba: "vendedor." + nombre + local + Salir. Si hay carritos abiertos del vendedor, una tira con sus números (`LL-0012`) para cambiar entre ellos; botón "Nuevo cliente" deja de mostrar el carrito actual (el carrito sigue guardado).
2. Buscador: no busca hasta 4 caracteres; debounce 300 ms; descarta respuestas viejas (guardar un contador de búsqueda y aplicar solo la última — en la feria quedó pendiente "respuestas fuera de orden").
3. Cada resultado: foto (`templateId`), SKU, nombre, precio a cobrar (promo con el full tachado si hay promo), y debajo los precios con efectivo y transferencia (de `config.paymentMethods`, informativos), y `StockBadges`.
4. `StockBadges`: chips "Local 3 · Exhib. 1", "Rolón 5", "Web 2" (o "Web: hay" si `unlimited`), y "Otros: Alcorta 3 · Belgrano 0" en gris. En 0 el chip se ve apagado pero se lee el número.
5. "Agregar": abre una hoja inferior con cantidad, **origen** (Stock del local / Exhibición / Rolón — deshabilitado el que tiene 0 disponible, con el número al lado) y **entrega** (los 5 modos; "Se lo lleva ahora" deshabilitado si el origen es Rolón; "Retira en otro local" pide elegir local; "Retira en Rolón" solo con origen Rolón). Valores por defecto: origen = Stock si tiene, si no Exhibición, si no Rolón; entrega = "Se lo lleva ahora" si el origen es del local, si no "Retira otro día en el local". Confirmar → `POST /carts` (si no hay carrito activo) o `POST /carts/:id/lines`.
6. Carrito: cada línea con nombre, cantidad (− / +), origen y entrega editables (`LineEditor`, mismo formulario que el punto 5) y quitar. Errores del servidor ("Sin stock suficiente — …") se muestran en un `Notice` arriba del carrito sin perder lo cargado.
7. Si alguna línea es "Envío a domicilio": `ShippingFields` (calle, número, piso, localidad, código postal, teléfono, notas, **costo del envío** a mano, en pesos).
8. Cliente (`CustomerForm`): campo DNI/CUIT → "Buscar" → `GET /customers/lookup`. Si viene `arca`, completa nombre/razón social, domicilio y muestra la condición de IVA (`AFIP_LABELS`) como texto fijo con la etiqueta "según ARCA"; si viene `odoo`, completa email/teléfono y guarda `odooPartnerId` y `tagIds` (si tiene la etiqueta `config.settings.decoradorTagId`, mostrar el chip "Decorador/Arquitecto"). Si no viene nada: campos vacíos para cargar a mano. Obligatorios: documento, nombre, teléfono, email (validar en el front con los mismos mensajes del backend antes de enviar). `arcaError` se muestra como aviso informativo, no bloquea.
9. Barra fija abajo: total de productos (Σ cantidad × precio a cobrar) y botón "Enviar a caja" → `POST /carts/:id/submit`. Al terminar: mensaje grande "LL-0012 enviado a caja" y carrito vacío.
10. "Vaciar carrito" (con confirmación en la misma pantalla, no `window.confirm`) → `DELETE /carts/:id`.

- [ ] **Step 1: `StockBadges.jsx`**

```jsx
import styles from './StockBadges.module.css';

function Badge({ label, qty, text }) {
  const empty = qty === 0;
  return <span className={`${styles.badge} ${empty ? styles.empty : ''}`}>{label} {text ?? qty}</span>;
}

export default function StockBadges({ stock, compact = false }) {
  if (!stock) return null;
  return (
    <div className={styles.row}>
      {stock.local && <Badge label="Local" qty={stock.local.stock} />}
      {stock.local && <Badge label="Exhib." qty={stock.local.exhibicion} />}
      <Badge label="Rolón" qty={stock.rolon} />
      <Badge label="Web" qty={stock.web.unlimited ? 1 : stock.web.qty} text={stock.web.unlimited ? 'hay' : undefined} />
      {!compact && stock.otros.length > 0 && (
        <span className={styles.others}>Otros: {stock.otros.map((o) => `${o.name} ${o.qty}`).join(' · ')}</span>
      )}
    </div>
  );
}
```

```css
.row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.badge { padding: 3px 8px; border-radius: 6px; background: var(--done-bg); color: var(--done); font-size: 13px; font-weight: 500; }
.empty { background: var(--wash-2); color: var(--ink-3); }
.others { font-size: 13px; color: var(--ink-3); }
```

- [ ] **Step 2: `ProductSearch.jsx`** — input + lista de resultados según puntos 2–4; prop `onPick(product)`. Para descartar respuestas viejas:

```jsx
const seq = useRef(0);
useEffect(() => {
  const q = query.trim();
  if (q.length < 4) { setResults([]); return undefined; }
  const id = ++seq.current;
  const timer = setTimeout(async () => {
    try {
      const found = await api(`/products/search?q=${encodeURIComponent(q)}`);
      if (id === seq.current) setResults(found);
    } catch (err) {
      if (id === seq.current) setError(err.message);
    }
  }, 300);
  return () => clearTimeout(timer);
}, [query]);
```

- [ ] **Step 3: `LineEditor.jsx`** — formulario de cantidad/origen/entrega/local de retiro (punto 5) usado tanto al agregar como al editar. Props: `{ product|line, stock, locales, ownLocalId, value, onChange }`. Regla de habilitado:

```js
const deliveryAllowed = (delivery, origin) => {
  if (delivery === 'ahora') return origin !== 'rolon';
  if (delivery === 'retira_rolon' || delivery === 'retira_otro_local') return origin === 'rolon';
  return true;
};
```

Al cambiar el origen, si la entrega elegida deja de ser válida, pasar a `retira_local`.

- [ ] **Step 4: `CustomerForm.jsx` y `ShippingFields.jsx`** — según puntos 7 y 8. `CustomerForm` expone `value` (`{ docNumber, name, phone, email, street, city, zip, afipResponsibility, fromArca, odooPartnerId, tagIds }`) y `onChange`. Al buscar con `arca`: `{ ...value, name: arca.name, street: arca.street, city: arca.city, zip: arca.zip, afipResponsibility: arca.afipResponsibility, fromArca: true }`; con `odoo`: completa `email`, `phone` (si estaban vacíos), `odooPartnerId: odoo.id`, `tagIds: odoo.tagIds`, y si no hubo ARCA también `name`/`street`/`city`/`zip`/`afipResponsibility`.

- [ ] **Step 5: `VendedorPanel.jsx`** — arma todo lo anterior (puntos 1, 6, 9, 10). Estado: `config`, `carts`, `activeCartId`, `notice`. Cargar `GET /config` y `GET /carts` al montar; después de cada operación de carrito, reemplazar el carrito en `carts` con la respuesta del servidor (la respuesta trae el pedido completo).

- [ ] **Step 6: Estilos** — `VendedorPanel.module.css`: una columna en celular; en tablet (≥ 768 px) dos columnas (búsqueda | carrito) con el carrito sticky. Barra inferior fija con `padding-bottom: env(safe-area-inset-bottom)`.

- [ ] **Step 7: Verificar en el navegador** (backend local con Task 13; crear antes un vendedor de prueba de `LL` desde `POST /api/pos/admin/users` con el token del superadmin) en ancho 390 px y 820 px: buscar "QUE" (no busca) → "QUEENS" (busca); agregar con origen Stock y "Se lo lleva ahora"; agregar otro con origen Rolón → "Se lo lleva ahora" está deshabilitado; cambiar a "Envío" → aparecen los campos de envío; buscar un CUIT real → datos de ARCA (si Task 14 está habilitada) o de Odoo; enviar a caja → mensaje con el número. Dos pestañas con dos vendedores agregando la última unidad de exhibición → la segunda ve "Sin stock suficiente". Build + lint OK. **Al terminar, vaciar/descartar los carritos de prueba.**

- [ ] **Step 8: Commit**

```bash
git add -A client/src
git commit -m "feat(vendedor): búsqueda con stock por depósito, origen y entrega por línea, cliente con ARCA"
```

---

### Task 18: Panel Caja (escritorio, menú lateral)

**Files:**
- Create: `src/pages/caja/CajaPanel.jsx` (reemplaza el placeholder), `src/pages/caja/QueueView.jsx`, `src/pages/caja/OrderDetail.jsx`, `src/pages/caja/PaymentBox.jsx`, `src/pages/caja/CashDayView.jsx`, `src/pages/caja/HistoryView.jsx`, `src/pages/caja/ProductsView.jsx`, `src/pages/caja/caja.module.css`
- Delete: `src/components/CashView.*`, `src/components/HistoryView.*`, `src/components/ProductLookupView.*`, `src/components/OrderLines.*`, `src/components/SplitPayment.*` (reemplazados; copiar de ellos lo que sirva antes de borrar)

**Interfaces (API usada):** `GET /config`, `GET /orders/queue`, `GET /orders/:id` → `{ order, preview }`, `PATCH /orders/:id`, `POST /orders/:id/lines`, `PATCH|DELETE /orders/:id/lines/:lineId`, `POST /orders/:id/confirm`, `POST /orders/:id/invoice`, `POST /orders/:id/annul`, `POST /carts` (pedido nuevo desde caja) + `POST /carts/:id/submit`, `GET /history?months=`, `GET /cash/current`, `POST /cash/open|close|movements`, `POST /cash/movements/:id/void`, `PATCH /cash/notes`, `GET /products/search`.

Menú lateral (`SidebarShell`, panel "caja", subtítulo = nombre del local): **Pedidos** (badge = cantidad en cola), **Nuevo pedido**, **Caja del día**, **Historial**, **Productos**.

- [ ] **Step 1: `QueueView.jsx`** — lista de la cola (`GET /orders/queue`, refresco cada 15 s y al volver a la pestaña): número, vendedor, cliente, cantidad de productos, hora de envío, chip de estado (los "Con error" primero, con su `errorDetail`). Buscador por número/cliente (filtro local). Click → `OrderDetail`.

- [ ] **Step 2: `OrderDetail.jsx`** — dos columnas en escritorio:
  - Izquierda: líneas (nombre, SKU, cantidad editable, origen y entrega con `LineEditor`, quitar), "Agregar producto" (`ProductSearch` → `POST /orders/:id/lines`), envío (`ShippingFields`), cliente (`CustomerForm` — guardar con `PATCH /orders/:id { customer }`), notas.
  - Derecha (`PaymentBox`, sticky): medios de pago y total.
  - Siempre que algo cambia: `PATCH` y luego re-`GET /orders/:id` para tomar `preview` (los totales los calcula SIEMPRE el servidor; el front no recalcula la cascada).

- [ ] **Step 3: `PaymentBox.jsx`**:
  - Medio de pago: botones con los `config.paymentMethods` (`label` + "−15 %" si tiene descuento). Si el medio tiene `details` (crédito), segundo selector con los detalles (1, 3, 6, 12, 18 cuotas). Guarda `PATCH { payments: [{ methodId, detailId }] }`.
  - "Dividir pago": agrega filas `{ methodId, detailId, amount }`; muestra "Falta asignar $ X" / "Sobra $ X" contra `preview.totals.total`; aviso fijo: "Con pago dividido se aplica el menor descuento de los medios elegidos".
  - Descuento extra: selector con `config.promotions` (`kind === 'motivo'`) y campo "Cupón" → `PATCH { discountChoice: { promotionId } | { code } }`; si el servidor devuelve error (cupón inválido, condición no cumplida) se muestra y se limpia la elección. Si `preview.extraDiscount` vino de una promoción `auto` (decorador), mostrarla como "Aplicado automáticamente: Decorador/Arquitecto 5 %".
  - Desglose (de `preview.totals`): Productos, Descuento medio de pago (−), **Subtotal**, Descuento extra (−), Envío (+), **Total** grande.
  - "¿Quiere factura?" (switch) → `PATCH { wantsInvoice }`; deshabilitado con texto "Este local todavía no factura desde el sistema" si el local de `config.locales` tiene `invoices: false`. Si está activo y el cliente tiene CUIT sin condición de IVA, aviso "Buscá el CUIT en ARCA para saber si es A o B".
  - Botón **Confirmar venta** (deshabilitado mientras `preview.error` o falta medio de pago). Durante la confirmación: estado "Confirmando en Odoo…". Resultado: número Odoo (S0xxxxx), factura si hubo, y `warning` si vino (remito de Rolón o entrega en el acto que no se pudo hacer). Error → mensaje del servidor y el pedido queda "Con error" con botón "Reintentar".
  - Si la caja está cerrada, el backend responde con el mensaje de caja cerrada: mostrarlo con un botón que lleva a "Caja del día".

- [ ] **Step 4: Nuevo pedido desde caja** — misma búsqueda + `LineEditor` + `CustomerForm` que el vendedor, en layout de escritorio; al terminar `POST /carts/:id/submit` y abrir el pedido en `OrderDetail` para cobrarlo.

- [ ] **Step 5: `CashDayView.jsx`** — adaptar `components/CashView.jsx` de la feria a la API nueva: sin caja abierta → muestra el último cierre (`lastClosed.countedCash`) y pide el fondo inicial; abierta → resumen por medio de pago (`summary.byMethod` con los `label` de `config.paymentMethods`, y el desglose de cuotas de `summary.byDetail`), movimientos (gasto con concepto, retiro, ingreso en dólares con monto USD y cotización), anular movimiento, notas, efectivo esperado, y cierre con el efectivo contado y la diferencia en color.

- [ ] **Step 6: `HistoryView.jsx`** — `GET /history?months=<mes actual>` con selector de mes (últimos 6); tabla con número, fecha, vendedor, cliente, total, medio, estado, S0xxxx, factura; filtros por texto y estado. Abrir → `OrderDetail` en modo lectura con acciones: "Anular venta" (pide motivo; el servidor rechaza con factura o con algo entregado y se muestra su mensaje), "Reintentar factura" si hay `invoiceError`, editar notas.

- [ ] **Step 7: `ProductsView.jsx`** — `ProductSearch` en grande con `StockBadges` completos y los precios por medio de pago, solo consulta.

- [ ] **Step 8: Verificar en el navegador** (1366 × 768 y 1920 × 1080) contra el backend local: abrir caja con $ 20.000; abrir el pedido que mandó el vendedor en Task 17; efectivo → ver −15 %; cambiar a crédito 6 cuotas → sin descuento; dividir 50/50 transferencia + crédito → sin descuento y "Falta asignar" en 0 al completar; cupón inválido → error; cambiar una cantidad con pago dividido → "Confirmar" falla con el mensaje de montos (Review Focus #2); registrar un gasto. **La confirmación real en Odoo NO se prueba acá** (es Task 20, con autorización). Build + lint OK.

- [ ] **Step 9: Commit**

```bash
git add -A client/src
git commit -m "feat(caja): cola, cobro con cascada y pago dividido, caja del día, historial y productos"
```

---

### Task 19: Panel Admin (escritorio, menú lateral)

**Files:**
- Create: `src/pages/admin/AdminPanel.jsx` (reemplaza el placeholder), `src/pages/admin/LocalesView.jsx`, `src/pages/admin/SettingsView.jsx`, `src/pages/admin/PaymentMethodsView.jsx`, `src/pages/admin/PromotionsView.jsx`, `src/pages/admin/UsersView.jsx`, `src/pages/admin/AdminHistoryView.jsx`, `src/pages/admin/AdminStatsView.jsx`, `src/pages/admin/CashSessionsView.jsx`, `src/pages/admin/admin.module.css`
- Delete: `src/components/UsersView.*`, `src/components/StatsView.*` (reemplazados; reusar su estructura)

**Interfaces (API usada):** `GET /admin/options`, `GET|PUT /admin/locales[/:id]`, `GET|PUT /admin/settings`, `GET|PUT /admin/payment-methods[/:id]`, `GET|POST|PUT /admin/promotions[/:id]`, `GET|POST|PATCH|DELETE /admin/users[/:id]`, `GET /admin/stats?from=&to=&localId=`, `GET /history?localId=&months=`, `GET /cash/sessions?localId=`.

Menú lateral (panel "admin"): **Estadísticas**, **Historial**, **Cajas**, **Promociones**, **Medios de pago**, **Usuarios**, **Locales**, **Ajustes**. Todos los desplegables de ids de Odoo (depósito, ubicaciones, equipo, diario, listas de precios, tipo de operación, etiqueta) salen de `GET /admin/options` y muestran el nombre, nunca el id pelado.

- [ ] **Step 1: `LocalesView.jsx`** — tabla de los 3 locales; editar en un panel lateral: nombre, dirección (para "Retira en Local X"), depósito, ubicación Stock, ubicación Exhibición, equipo de ventas, diario de facturas (con opción "Sin facturación"), activo. Guardar → `PUT /admin/locales/:id`; errores del servidor en `Notice`.

- [ ] **Step 2: `SettingsView.jsx`** — Rolón (depósito, ubicación, tipo de operación de despachos), Web (ubicación), lista de precios full (opcional, "usar precio de venta del producto" si vacío), lista de precios promocional, SKU del producto de envío, etiqueta de decorador. Texto de ayuda junto a las listas: "Las listas cambian de nombre cada mes en Odoo: actualizalas acá cuando cambien".

- [ ] **Step 3: `PaymentMethodsView.jsx`** — tabla: nombre, % de descuento, medio de Odoo (o detalles), activo, orden. Editar → `PUT /admin/payment-methods/:id`. Para medios con detalles (crédito), editor de filas `{ label, odooName }`. Botón "Nuevo medio" (id = slug del nombre).

- [ ] **Step 4: `PromotionsView.jsx`** — tabla con nombre, tipo (Cupón / Motivo para caja / Automática), descuento (% o $), código, vigencia, condiciones (medio de pago, etiqueta de cliente), activa. Crear/editar en panel lateral; **no se borran, se desactivan**. Texto de ayuda: "Se aplica sobre el subtotal (después del descuento por medio de pago). Una sola por venta".

- [ ] **Step 5: `UsersView.jsx`** — adaptar el de la feria: listado con filtro por local y rol; alta/edición con nombre, rol (vendedor / caja / admin / superadmin — los dos últimos solo si el usuario actual es superadmin), local (vendedor y caja), PIN (vendedor) o usuario + contraseña (caja/admin; al editar, contraseña vacía = no cambia), activo; borrar con confirmación en pantalla.

- [ ] **Step 6: `AdminHistoryView.jsx`** — como el historial de caja pero con selector de local ("Todos") y de mes; solo lectura + exportar CSV en el navegador (número, fecha, local, vendedor, cliente, documento, total, medio, detalle, S0xxxx, factura, estado).

- [ ] **Step 7: `AdminStatsView.jsx`** — rango (hoy / esta semana / este mes / mes anterior / personalizado) y local; tarjetas: ventas, total, total sin IVA, ticket promedio; tablas: por local, por vendedor, por medio de pago, top 20 productos. Barras horizontales simples en CSS (sin librerías nuevas).

- [ ] **Step 8: `CashSessionsView.jsx`** — `GET /cash/sessions` por local: apertura, cierre, quién, fondo, esperado, contado, diferencia (rojo si ≠ 0), notas; detalle con movimientos y resumen por medio.

- [ ] **Step 9: Verificar en el navegador** — con el superadmin: cargar en Ajustes el tipo de operación de Rolón y las listas de precios del spike (Task 1); crear una promo "Decorador/Arquitecto" (automática, 5 %, solo efectivo, etiqueta Decorador/Arquitecto); crear un cupón de prueba y desactivarlo después; crear un usuario caja de `LL`; entrar con él a `/#/caja` y ver el local en el subtítulo; con un usuario admin (no super) verificar que no puede crear admins. Build + lint OK.

- [ ] **Step 10: Commit**

```bash
git add -A client/src
git commit -m "feat(admin): locales, ajustes, medios de pago, promociones, usuarios, historial, estadísticas y cajas"
```

---

### Task 20: Prueba de punta a punta en Odoo y despliegue

**Requiere autorización explícita del dueño antes del Step 2** (crea pedidos reales en Odoo). Facturación: solo si el dueño lo autoriza en el momento; si no, `POS_INVOICING_ENABLED` queda sin definir.

**Files:**
- Modify: `punto-venta-altorancho/README.md` (sección Despliegue), `Reportes/README.md` (variables del POS)
- Create: `punto-venta-altorancho/docs/superpowers/spikes/2026-10-e2e.md` (registro de la prueba)

- [ ] **Step 1: Preparar** — reiniciar el backend local con el último código (regla: nunca probar en vivo con un servidor viejo). Admin → Ajustes con los ids del spike. Abrir caja en `LL`.

- [ ] **Step 2: E2E por modo de entrega** (con autorización; cliente de prueba con DNI y otro con CUIT):
  1. Stock del local + "Se lo lleva ahora", efectivo → pedido confirmado, remito del local **validado**, línea "entregada".
  2. Exhibición + "Retira otro día en el local", transferencia → remito del local pendiente desde `LL/Exhibicion`, contacto de entrega "Retira en Local Las Lomas".
  3. Rolón + "Envío", crédito 6 cuotas, envío $ 15.000 → remito en **Rolón Local → Despachos** con la dirección; línea de envío en el pedido sin descuento; medio de pago "Mercado Pago 6 cuotas".
  4. Mixto: una línea del local "ahora" + una de Rolón "Retira en otro local (Alcorta)", pago dividido efectivo + crédito → menor descuento (0 %), dos remitos.
  5. Cliente CUIT con ARCA (si Task 14 está activa) → partner con condición de IVA correcta.
  6. Reintento: cortar la red del backend después de crear (o forzar un error de Odoo con un SKU inexistente agregado a mano en Firestore) → pedido "Con error"; arreglar y reintentar → un solo `sale.order`.
  En cada caso anotar en `2026-10-e2e.md`: número interno, S0xxxx, remitos, qué se vio en Odoo.

- [ ] **Step 3: Revertir** — anular desde el panel lo anulable; lo que no, cancelarlo en Odoo; anotar todo en `2026-10-e2e.md`. Borrar de Firestore los pedidos de prueba (`pos_orders` con `localId` de prueba / números usados), sus `pos_reservations`, `pos_counters/orders_LL` (para que la numeración real empiece en `LL-0001`) y las sesiones de caja de prueba. Borrar usuarios de prueba.

- [ ] **Step 4: Variables en Railway** (las carga el dueño): `POS_AUTH_SECRET`, `POS_SUPERADMIN_USERNAME`, `POS_SUPERADMIN_INITIAL_PASSWORD`, `POS_SUPERADMIN_NAME`, y cuando corresponda `POS_ARCA_CUIT`, `POS_ARCA_CERT`, `POS_ARCA_KEY`, `POS_ARCA_ENV`, `POS_INVOICING_ENABLED`. Documentarlas en `Reportes/README.md`.

- [ ] **Step 5: Desplegar backend** — con autorización: `git push` de `Reportes/main` (Railway despliega). Verificar `GET /api/pos/config` → 401 sin token y la feria (`/api/feria/auth/users`) igual que antes.

- [ ] **Step 6: Desplegar frontend** — `VITE_API_URL=<url de Railway> npm run build`, verificar `dist/assets/*.js`, y subir `client/dist` al hosting que elija el dueño (igual que la feria). Documentar en `README.md`.

- [ ] **Step 7: Commit y push del frontend**

```bash
cd punto-venta-altorancho
git add README.md docs/superpowers/spikes/2026-10-e2e.md
git commit -m "docs: prueba de punta a punta y despliegue del POS de locales"
git push
```

---

## Cobertura del spec (auto-revisión)

| Spec | Tarea |
|---|---|
| §2 Arquitectura (módulos `pos*`, `/api/pos`, feria intacta, sin índices compuestos) | 2–13 (Global Constraints) |
| §3 Locales/depósitos configurables, web solo lectura, stock "infinito" | 3, 6, 19 |
| §4.1 Vendedor | 17 |
| §4.2 Caja | 18 |
| §4.3 Admin | 19 |
| §4.4 Roles validados en backend | 2, 13 |
| §5.1 Precio promo/full desde Odoo | 1 (S3), 6 |
| §5.2 Cascada, cupones, motivos, decorador | 4, 5, 8, 18 |
| §5.3 Origen y entrega por línea | 7, 9, 10, 17 |
| §5.4 Cliente CUIT/DNI, ARCA | 9, 14, 17 |
| §5.5 Medio + detalle, pago dividido | 3, 4, 8, 18 |
| §5.6 Caja del día por local, USD | 11, 18 |
| §5.7 Factura A/B por local, apagada por defecto | 10, 13, 20 |
| §5.8 Numeración, estados, anulación | 7, 8, 10 |
| §6 Odoo al confirmar, reintentos, claim | 9, 10 |
| §7 Datos Firestore | 2, 3, 5, 7, 8, 11 |
| §8 Diseño visual | 16–19 |
| §9 Spikes S1–S5 | 1, 14 |
| §10 Pruebas | tests por tarea, 20 |
| (nuevo) Dashboard de Reportes sigue viendo las ventas de locales | 15 |
