# Punto de venta locales — Fase 2 (cambios y devoluciones) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cambios y devoluciones desde el panel (vendedor arma o caja directo → caja cobra o reintegra → Odoo), con compra original de la app, del POS de Odoo, de Tiendanube o sin ticket, destino por línea, nota de crédito automática y saldo a favor.

**Architecture:** Un cambio/devolución es un documento más de `pos_orders` con una parte nueva `returnLines` ("lo que vuelve") junto a las `lines` ("lo nuevo"). Al confirmar: devoluciones de remito en Odoo (`stock.return.picking`) o ingreso suelto → transferencia a otro depósito si el destino lo pide → nota de crédito parcial revirtiendo la factura original (o suelta) → lo nuevo con el flujo de la Fase 1 → aplicación de la NC a la factura nueva. Cada paso se guarda en `returnSteps` para reanudar sin duplicar. El saldo a favor vive en `pos_credits` (la app no registra cobros en Odoo).

**Tech Stack:** Node 22 ESM, Express 4, firebase-admin 12, `node:test`; React 18, CSS Modules, Vite 5. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-10-16-punto-venta-locales-fase2-design.md` (este repo). Spike: `docs/superpowers/spikes/2026-10-fase2-odoo-spikes.md`. Base: plan y spec de la Fase 1.

## Global Constraints

- Repos: backend `C:\Users\Usuario\LETT COMERCIAL Dropbox\JOAQUIN DI LERNIA\DEV-JOAQUIN-DI-LERNIA\DEV-ALTORANCHO\Reportes` (producción en Railway desde `main`); frontend `...\DEV-ALTORANCHO\punto-venta-altorancho`. **Trabajar en la rama `feature/pos-fase2` en los dos repos**; se mergea a `main` en la Task 15.
- **Los archivos `feria*.mjs`, `feriaRoutes.mjs`, `sync/feria.mjs` NO se modifican.** Se importan funciones genéricas de ellos.
- **La venta de la Fase 1 no cambia de comportamiento:** `computeTotals` no se toca; los tests existentes siguen pasando sin editarlos (salvo los que la tarea indique explícitamente).
- Rutas bajo `/api/pos/*`; colecciones con prefijo `pos_` (nueva: `pos_credits`).
- **Sin índices compuestos de Firestore:** un solo campo en `where`; el resto se filtra/ordena en código.
- Precios en la app **con IVA**; a Odoo **sin IVA** (`netOfIva`).
- **No hay entorno de prueba de Odoo.** Ninguna escritura en Odoo fuera de los tests con `deps`/`odoo` falsos, salvo la Task 15 con autorización del dueño en el momento. Facturas y notas de crédito solo se crean/publican si `invoicingEnabledFor(locale)` (`POS_INVOICING_ENABLED=true` + diario del local).
- Valor de lo devuelto: lo pagado (descuentos prorrateados); sin ticket, precio de lista actual. **Sin edición manual.**
- Cualquier cajero hace excepciones; **motivo obligatorio** y queda quién lo hizo.
- Descuentos por medio de pago en un cambio: **solo sobre la diferencia** que paga el cliente.
- "Saldo a favor" es un medio de pago (`methodId: 'saldo'`, 0 % de descuento); pagar con saldo no suma descuento de efectivo (regla del pago dividido: manda el menor %).
- La NC se emite en el diario del local que hace la operación, revirtiendo la factura original (`account.move.reversal`, `refund_method: 'refund'`, líneas editadas en borrador). No se usa la facturación desde el `sale.order` (spike: con `invoice_policy = order` no genera cantidad negativa).
- En el asistente `stock.return.picking` (v16) las líneas y la ubicación NO vienen de `default_get`: se arman a mano desde los moves `done` del remito; nunca marcar `create_rma`.
- Remitos creados a mano (ingreso sin ticket, transferencia a Rolón) necesitan que el usuario de la API tenga el grupo RMA (spike). El código los hace igual; si Odoo responde "No puedes ingresar a los registros 'RMA'", el error se muestra tal cual.
- Tests backend: `cd Reportes/backend && npm test`. Frontend: `cd punto-venta-altorancho/client && npm run build`.
- Textos de la UI en español rioplatense.
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **La misma línea devuelta dos veces** (dos operaciones en paralelo, o una ya devuelta en el POS nativo) → la segunda se frena al confirmar con "ya se devolvió", sin crear otro remito. (Test en Task 8.)
2. **Dos cajas gastando el mismo saldo a la vez** → una sola lo consume; la otra recibe "saldo insuficiente". (Test en Task 5.)
3. **Reintento después de una falla a mitad** (remito creado, NC falló) → reanuda en la NC sin crear un segundo remito ni una segunda NC. (Test en Task 8.)
4. **Reintegro que no suma lo que hay que devolver**, o que deja de sumar porque caja editó lo nuevo después → confirmar se bloquea con el mensaje de montos. (Test en Task 2 y Task 6.)
5. **Saldo vencido** → no aparece disponible ni se puede usar; extendido por admin vuelve a estar disponible. (Test en Task 5.)

---

## Mapa de archivos

Backend (`Reportes/backend/`):

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `posConfig.mjs` | Modificar | destinos de devolución y tipos de remito por local; ajustes de saldo, motivos y búsqueda |
| `posReturns.mjs` | Crear | puro: línea que vuelve, topes, valor, tipo de operación, reintegro, agrupación |
| `posPricing.mjs` | Modificar | `computeExchangeTotals` (descuento sobre la diferencia), `collectOf` |
| `posCredits.mjs` | Crear | saldo a favor: puro (asignación, vencimiento) + Firestore `pos_credits` |
| `posReturnsOdoo.mjs` | Crear | Odoo: búsqueda y lectura de compras (TPV, web, app), devoluciones de remito, ingreso suelto, transferencia, NC, aplicación |
| `posReturnsService.mjs` | Crear | une Firestore + Odoo: buscar compras, leer una compra, resolver la línea elegida |
| `posOrders.mjs` | Modificar | `returnLines` en carrito/caja, reintegro, consumo de saldo en el reclamo, alta del saldo al confirmar |
| `posReturnsConfirm.mjs` | Crear | pasos de Odoo de lo que vuelve (reanudables) y aplicación de NC |
| `posConfirm.mjs` | Modificar | enganchar el flujo de cambio/devolución; medio de Odoo sin "saldo"; bloquear anular devoluciones |
| `posCash.mjs`, `posStats.mjs` | Modificar | reintegros, saldos emitidos/usados, estadísticas netas |
| `posRoutes.mjs` | Modificar | `/returns/*`, `/orders/:id/return-lines`, `/credits`, `/admin/credits` |

Frontend (`punto-venta-altorancho/client/src/`):

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `lib/returns.js` | Crear | etiquetas, armado de bodies, neto estimado |
| `components/ReturnPicker.jsx` + `.module.css` | Crear | buscar compra → elegir líneas, cantidad, destino, motivo |
| `components/ReturnLines.jsx` | Crear | lista "Vuelve" editable |
| `components/CreditBadge.jsx` | Crear | "Tiene $ X a favor (vence dd/mm)" |
| `pages/VendedorPanel.jsx` | Modificar | modo "Cambio / devolución" |
| `pages/caja/NewOrderView.jsx`, `OrderDetail.jsx`, `PaymentBox.jsx`, `RefundBox.jsx` (nuevo), `QueueView.jsx`, `HistoryView.jsx`, `CashDayView.jsx` | Modificar/Crear | operación en caja, reintegro, saldo, etiquetas, caja del día |
| `pages/admin/LocalesView.jsx`, `SettingsView.jsx`, `CreditsView.jsx` (nuevo), `AdminPanel.jsx`, `AdminHistoryView.jsx` | Modificar/Crear | destinos, ajustes, saldos |

---

### Task 1: Configuración — destinos de devolución, tipos de remito y ajustes

**Files:**
- Modify: `Reportes/backend/posConfig.mjs`
- Test: `Reportes/backend/test/posConfig.test.mjs`

**Interfaces:**
- Produces:
  - `DEFAULT_LOCALES[i]` con `returnPickingTypeId`, `internalPickingTypeId`, `returnDestinations`.
  - `DEFAULT_SETTINGS` con `creditValidityDays: null`, `returnReasons: string[]`, `returnSearchDays: 365`, `creditOdooPaymentName: null`.
  - `defaultReturnDestinations(locale, settings) → Destination[]`
  - `returnDestinationsOf(locale, settings) → Destination[]` (activos; los del local o los por defecto)
  - `findDestination(locale, settings, id) → Destination` (tira `Destino de devolución inválido`)
  - `Destination = { id, label, locationId, transferToLocationId: number|null, default: boolean, active: boolean }`

- [ ] **Step 1: Crear la rama en los dos repos**

```bash
cd "C:/Users/Usuario/LETT COMERCIAL Dropbox/JOAQUIN DI LERNIA/DEV-JOAQUIN-DI-LERNIA/DEV-ALTORANCHO/Reportes" && git checkout -b feature/pos-fase2
cd "../punto-venta-altorancho" && git checkout -b feature/pos-fase2
```

- [ ] **Step 2: Tests que fallan** (agregar al final de `test/posConfig.test.mjs`; sumar a su import `defaultReturnDestinations, returnDestinationsOf, findDestination` si no están)

```js
import {
  validateLocale, validateSettings, DEFAULT_LOCALES, DEFAULT_SETTINGS,
  defaultReturnDestinations, returnDestinationsOf, findDestination,
} from '../posConfig.mjs';

const LL = DEFAULT_LOCALES.find((l) => l.id === 'LL');

test('defaultReturnDestinations: stock (por defecto), exhibición y enviar a Rolón', () => {
  const d = defaultReturnDestinations({ ...LL, returnDestinations: undefined }, DEFAULT_SETTINGS);
  assert.deepEqual(d.map((x) => [x.id, x.locationId, x.transferToLocationId, x.default]), [
    ['stock', 8, null, true], ['exhibicion', 324, null, false], ['rolon', 8, 174, false],
  ]);
});

test('returnDestinationsOf: usa los del local (solo activos) y si no hay, los por defecto', () => {
  const own = [
    { id: 'fallas', label: 'Fallas', locationId: 392, transferToLocationId: null, default: true, active: true },
    { id: 'viejo', label: 'Viejo', locationId: 8, transferToLocationId: null, default: false, active: false },
  ];
  assert.deepEqual(returnDestinationsOf({ ...LL, returnDestinations: own }, DEFAULT_SETTINGS).map((d) => d.id), ['fallas']);
  assert.equal(returnDestinationsOf({ ...LL, returnDestinations: [] }, DEFAULT_SETTINGS)[0].id, 'stock');
});

test('findDestination: id desconocido tira', () => {
  assert.equal(findDestination(LL, DEFAULT_SETTINGS, 'exhibicion').locationId, 324);
  assert.throws(() => findDestination(LL, DEFAULT_SETTINGS, 'nope'), /Destino de devolución inválido/);
});

test('validateLocale: destinos y tipos de remito', () => {
  assert.deepEqual(validateLocale(LL), []);
  const bad = {
    ...LL, returnPickingTypeId: 0,
    returnDestinations: [
      { id: 'a', label: '', locationId: 8, transferToLocationId: null, default: true, active: true },
      { id: 'a', label: 'B', locationId: 0, transferToLocationId: 'x', default: true, active: true },
    ],
  };
  assert.deepEqual(validateLocale(bad), [
    'Tipo de remito de devolución inválido',
    'Destino de devolución: falta el nombre',
    'Destino de devolución "B": ubicación inválida',
    'Destino de devolución "B": depósito de traslado inválido',
    'Destino de devolución repetido: a',
    'Tiene que haber un solo destino de devolución por defecto',
  ]);
});

test('validateSettings: saldo, motivos y días de búsqueda', () => {
  assert.deepEqual(validateSettings(DEFAULT_SETTINGS), []);
  assert.deepEqual(validateSettings({ ...DEFAULT_SETTINGS, creditValidityDays: 0, returnReasons: [], returnSearchDays: 5000, creditOdooPaymentName: '' }), [
    'Días de validez del saldo: entre 1 y 3650, o vacío para que no venza',
    'Cargá al menos un motivo de devolución',
    'Días de búsqueda de compras: entre 1 y 1095',
    'Medio de Odoo para saldo a favor inválido',
  ]);
});
```

- [ ] **Step 3: Correr y ver que fallan**

Run: `cd Reportes/backend && node --test test/posConfig.test.mjs`
Expected: FAIL (`defaultReturnDestinations` no está exportada).

- [ ] **Step 4: Implementar en `posConfig.mjs`**

Reemplazar `DEFAULT_LOCALES` y `DEFAULT_SETTINGS`:

```js
// Tipos de remito (spike Fase 2): "Devoluciones" (entrada) y "Transferencias
// internas" de cada almacén. Los destinos de devolución por defecto se arman
// con defaultReturnDestinations si el local no tiene los suyos.
export const DEFAULT_LOCALES = [
  { id: 'LL', name: 'Las Lomas', warehouseId: 1, stockLocationId: 8, exhibicionLocationId: 324, teamId: 6, invoiceJournalId: 32, address: '', active: true, returnPickingTypeId: 6, internalPickingTypeId: 5 },
  { id: 'BL', name: 'Belgrano', warehouseId: 40, stockLocationId: 372, exhibicionLocationId: 379, teamId: 18, invoiceJournalId: 65, address: '', active: true, returnPickingTypeId: 308, internalPickingTypeId: 307 },
  { id: 'AL', name: 'Alcorta', warehouseId: 41, stockLocationId: 397, exhibicionLocationId: 415, teamId: 25, invoiceJournalId: 78, address: '', active: true, returnPickingTypeId: 352, internalPickingTypeId: 351 },
];

export const DEFAULT_SETTINGS = {
  rolon: { warehouseId: 28, locationId: 174, outPickingTypeId: 191 },
  web: { locationId: 150 },
  fullPricelistId: 312,
  orderPricelistId: 314,
  promoPricelistId: 313,
  shippingProductSku: 'ENV002EX',
  decoradorTagId: 1,
  homeServiceSku: 'SERVIDOM',
  homeServiceDefaultAmount: 5000,
  creditValidityDays: null, // null = el saldo a favor no vence
  returnReasons: ['Talle o medida', 'Falla', 'No le gustó', 'Otro'],
  returnSearchDays: 365,
  creditOdooPaymentName: null, // payment.method de Odoo si se paga todo con saldo
};
```

Agregar debajo de `isId`:

```js
const DESTINATION_ID = /^[a-z0-9_-]{1,30}$/;

function validateDestinations(list) {
  if (list === undefined) return [];
  if (!Array.isArray(list)) return ['Destinos de devolución inválidos'];
  const errors = [];
  const seen = new Set();
  for (const d of list) {
    const label = String(d?.label ?? '').trim();
    if (!label) errors.push('Destino de devolución: falta el nombre');
    if (!DESTINATION_ID.test(String(d?.id ?? ''))) errors.push(`Destino de devolución "${label}": código inválido`);
    if (!isId(d?.locationId)) errors.push(`Destino de devolución "${label}": ubicación inválida`);
    if (d?.transferToLocationId != null && !isId(d.transferToLocationId)) errors.push(`Destino de devolución "${label}": depósito de traslado inválido`);
    if (seen.has(d?.id)) errors.push(`Destino de devolución repetido: ${d.id}`);
    seen.add(d?.id);
  }
  const active = list.filter((d) => d?.active !== false);
  if (active.length && active.filter((d) => d.default).length !== 1) errors.push('Tiene que haber un solo destino de devolución por defecto');
  return errors;
}
```

En `validateLocale`, antes del `return errors;`:

```js
  if (input.returnPickingTypeId != null && !isId(input.returnPickingTypeId)) errors.push('Tipo de remito de devolución inválido');
  if (input.internalPickingTypeId != null && !isId(input.internalPickingTypeId)) errors.push('Tipo de transferencia interna inválido');
  errors.push(...validateDestinations(input.returnDestinations));
```

En `validateSettings`, antes del `return errors;`:

```js
  const days = input.creditValidityDays;
  if (days != null && !(Number.isInteger(days) && days >= 1 && days <= 3650)) errors.push('Días de validez del saldo: entre 1 y 3650, o vacío para que no venza');
  if (input.returnReasons !== undefined) {
    const reasons = input.returnReasons;
    if (!Array.isArray(reasons) || !reasons.length) errors.push('Cargá al menos un motivo de devolución');
    else if (reasons.length > 20 || reasons.some((r) => typeof r !== 'string' || !r.trim() || r.length > 60)) errors.push('Motivos de devolución inválidos');
  }
  const search = input.returnSearchDays;
  if (search !== undefined && !(Number.isInteger(search) && search >= 1 && search <= 1095)) errors.push('Días de búsqueda de compras: entre 1 y 1095');
  const creditName = input.creditOdooPaymentName;
  if (creditName != null && !(typeof creditName === 'string' && creditName.trim())) errors.push('Medio de Odoo para saldo a favor inválido');
```

Agregar debajo de `originLocationId`:

```js
export function defaultReturnDestinations(locale, settings) {
  return [
    { id: 'stock', label: 'Stock del local', locationId: locale.stockLocationId, transferToLocationId: null, default: true, active: true },
    { id: 'exhibicion', label: 'Exhibición', locationId: locale.exhibicionLocationId, transferToLocationId: null, default: false, active: true },
    { id: 'rolon', label: 'Enviar a Rolón', locationId: locale.stockLocationId, transferToLocationId: settings.rolon.locationId, default: false, active: true },
  ];
}

export function returnDestinationsOf(locale, settings) {
  const own = (locale.returnDestinations ?? []).filter((d) => d.active !== false);
  return own.length ? own : defaultReturnDestinations(locale, settings);
}

export function findDestination(locale, settings, id) {
  const found = returnDestinationsOf(locale, settings).find((d) => d.id === id);
  if (!found) throw new Error('Destino de devolución inválido');
  return found;
}
```

Los locales guardados en Firestore antes de esta fase no tienen los tipos de remito: completarlos con los valores iniciales. En `loadAll`, reemplazar la línea de `locales:` por:

```js
    locales: locSnap.docs.map((d) => withLocaleDefaults({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name, 'es')),
```

y agregar arriba de `loadAll`:

```js
function withLocaleDefaults(locale) {
  const base = DEFAULT_LOCALES.find((l) => l.id === locale.id) ?? {};
  return {
    ...locale,
    returnPickingTypeId: locale.returnPickingTypeId ?? base.returnPickingTypeId ?? null,
    internalPickingTypeId: locale.internalPickingTypeId ?? base.internalPickingTypeId ?? null,
  };
}
```

- [ ] **Step 5: Correr todo**

Run: `cd Reportes/backend && npm test`
Expected: PASS (los nuevos y todos los anteriores).

- [ ] **Step 6: Commit**

```bash
git add posConfig.mjs test/posConfig.test.mjs
git commit -m "feat(pos): destinos de devolución por local y ajustes de saldo a favor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Modelo puro de la línea que vuelve (`posReturns.mjs`)

**Files:**
- Create: `Reportes/backend/posReturns.mjs`
- Test: `Reportes/backend/test/posReturns.test.mjs`

**Interfaces:**
- Consumes: `round2` (posPricing), `activeLines` (posLines).
- Produces:
  - `PurchaseLine = { source: 'app'|'tpv'|'web'|'manual', purchaseId: string|null, purchaseLabel: string|null, purchaseLineId: string|null, productId, sku, name, qtyBought, qtyReturnedBefore, unitValue, lots: [{ lotId, qty }], moveIds: number[], invoiceId: number|null, invoiceName: string|null, partnerVat: string|null, partnerName: string|null }`
  - `ReturnLine = PurchaseLine & { rlId, qty, destinationId, reason, reasonNote }`
  - `RETURN_SOURCES`, `SOURCE_LABELS`
  - `maxReturnable(pl) → number`
  - `validateReturnLine(rl, { destinationIds, reasons }) → string[]`
  - `buildReturnLine(purchaseLine, input, returnLines, ctx) → ReturnLine`
  - `editReturnLine(rl, changes, ctx) → ReturnLine`
  - `returnTotal(returnLines) → number`
  - `orderKind({ lines, returnLines }) → 'venta'|'cambio'|'devolucion'`
  - `appUnitValue(line, lineDiscountPct)`, `tpvUnitValue(posLine)`, `webUnitValue(saleLine)`
  - `validateRefund(refund, net, methodsById) → { cashBack: [{ methodId, amount }], credit } | null`
  - `invoiceGroups(returnLines) → [{ invoiceId, invoiceName, lines }]` (sin factura excluidas)

- [ ] **Step 1: Tests que fallan** — `test/posReturns.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  maxReturnable, validateReturnLine, buildReturnLine, editReturnLine, returnTotal, orderKind,
  appUnitValue, tpvUnitValue, webUnitValue, validateRefund, invoiceGroups,
} from '../posReturns.mjs';

const ctx = { destinationIds: ['stock', 'exhibicion'], reasons: ['Talle o medida', 'Otro'] };
const purchaseLine = (over = {}) => ({
  source: 'tpv', purchaseId: '48870', purchaseLabel: 'Alcorta/2301', purchaseLineId: '92250', productId: 68926, sku: 'IME031FS',
  name: 'Lámpara', qtyBought: 2, qtyReturnedBefore: 0, unitValue: 52990, lots: [], moveIds: [700],
  invoiceId: 368292, invoiceName: 'FA-B 00012-00001533', partnerVat: '30123456', partnerName: 'Ana', ...over,
});
const input = { qty: 1, destinationId: 'stock', reason: 'Talle o medida', reasonNote: '' };

test('maxReturnable: comprado menos lo ya devuelto', () => {
  assert.equal(maxReturnable(purchaseLine({ qtyBought: 3, qtyReturnedBefore: 1 })), 2);
});

test('buildReturnLine: arma la línea con id y valida', () => {
  const rl = buildReturnLine(purchaseLine(), input, [], ctx);
  assert.equal(rl.rlId, 'R1');
  assert.equal(rl.qty, 1);
  assert.equal(rl.unitValue, 52990);
  const second = buildReturnLine(purchaseLine({ purchaseLineId: '92251' }), input, [rl], ctx);
  assert.equal(second.rlId, 'R2');
});

test('buildReturnLine: la misma línea de compra no se agrega dos veces', () => {
  const rl = buildReturnLine(purchaseLine(), input, [], ctx);
  assert.throws(() => buildReturnLine(purchaseLine(), input, [rl], ctx), /ya está en lo que vuelve/);
});

test('validateReturnLine: tope, destino, motivo y "Otro" con texto', () => {
  const rl = { ...purchaseLine({ qtyReturnedBefore: 1 }), rlId: 'R1', qty: 2, destinationId: 'x', reason: 'Otro', reasonNote: '' };
  assert.deepEqual(validateReturnLine(rl, ctx), [
    'IME031FS: se pueden devolver hasta 1',
    'IME031FS: elegí el destino',
    'IME031FS: con "Otro" escribí el motivo',
  ]);
  assert.deepEqual(validateReturnLine({ ...rl, qty: 0, destinationId: 'stock', reason: 'Nada' }, ctx), [
    'IME031FS: cantidad inválida', 'IME031FS: elegí el motivo',
  ]);
});

test('editReturnLine: solo cantidad, destino y motivo', () => {
  const rl = buildReturnLine(purchaseLine(), input, [], ctx);
  const next = editReturnLine(rl, { qty: 2, destinationId: 'exhibicion', unitValue: 1 }, ctx);
  assert.equal(next.qty, 2);
  assert.equal(next.destinationId, 'exhibicion');
  assert.equal(next.unitValue, 52990);
  assert.throws(() => editReturnLine(rl, { qty: 3 }, ctx), /hasta 2/);
});

test('returnTotal y orderKind', () => {
  const r = [{ qty: 2, unitValue: 100.5 }, { qty: 1, unitValue: 10 }];
  assert.equal(returnTotal(r), 211);
  assert.equal(orderKind({ lines: [], returnLines: r }), 'devolucion');
  assert.equal(orderKind({ lines: [{ status: 'activo' }], returnLines: r }), 'cambio');
  assert.equal(orderKind({ lines: [{ status: 'eliminado' }], returnLines: r }), 'devolucion');
  assert.equal(orderKind({ lines: [{ status: 'activo' }], returnLines: [] }), 'venta');
});

test('valores unitarios por origen', () => {
  assert.equal(appUnitValue({ basePrice: 29990 }, 15), 25491.5);
  assert.equal(tpvUnitValue({ qty: 6, price_subtotal_incl: 81551.99 }), 13592);
  assert.equal(webUnitValue({ product_uom_qty: 1, price_total: 59990 }), 59990);
  assert.equal(tpvUnitValue({ qty: 0, price_subtotal_incl: 10 }), 0);
});

const methodsById = new Map([
  ['efectivo', { id: 'efectivo', label: 'Efectivo', active: true }],
  ['transferencia', { id: 'transferencia', label: 'Transferencia', active: true }],
]);

test('validateRefund: neto positivo o cero no lleva reintegro', () => {
  assert.equal(validateRefund(null, 100, methodsById), null);
  assert.equal(validateRefund({ cashBack: [], credit: 0 }, 0, methodsById), null);
});

test('validateRefund: reparte entre reintegro y saldo y tiene que sumar exacto', () => {
  assert.deepEqual(
    validateRefund({ cashBack: [{ methodId: 'efectivo', amount: 300 }], credit: 700 }, -1000, methodsById),
    { cashBack: [{ methodId: 'efectivo', amount: 300 }], credit: 700 },
  );
  assert.throws(() => validateRefund({ cashBack: [{ methodId: 'efectivo', amount: 300 }], credit: 0 }, -1000, methodsById),
    /El reintegro suma \$ 300 y hay que devolver \$ 1\.000/);
  assert.throws(() => validateRefund({ cashBack: [{ methodId: 'saldo', amount: 1000 }], credit: 0 }, -1000, methodsById), /Medio de reintegro inválido/);
  assert.throws(() => validateRefund({ cashBack: [{ methodId: 'efectivo', amount: 500 }, { methodId: 'efectivo', amount: 500 }], credit: 0 }, -1000, methodsById), /repetido/);
  assert.throws(() => validateRefund(null, -1000, methodsById), /Elegí cómo se devuelve/);
});

test('invoiceGroups: agrupa por factura original y saca las que no tienen', () => {
  const lines = [
    { rlId: 'R1', invoiceId: 1, invoiceName: 'FA-B 1' }, { rlId: 'R2', invoiceId: null },
    { rlId: 'R3', invoiceId: 1, invoiceName: 'FA-B 1' }, { rlId: 'R4', invoiceId: 2, invoiceName: 'FA-B 2' },
  ];
  assert.deepEqual(invoiceGroups(lines).map((g) => [g.invoiceId, g.lines.map((l) => l.rlId)]), [[1, ['R1', 'R3']], [2, ['R4']]]);
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `cd Reportes/backend && node --test test/posReturns.test.mjs`
Expected: FAIL (`Cannot find module '../posReturns.mjs'`).

- [ ] **Step 3: Implementar `posReturns.mjs`**

```js
// Lo que vuelve en un cambio o devolución. Todo puro: la E/S vive en
// posReturnsService / posReturnsOdoo / posOrders. Una línea que vuelve se arma
// SIEMPRE desde la compra leída en el servidor (nunca con valores del cliente).
import { round2 } from './posPricing.mjs';
import { activeLines } from './posLines.mjs';

export const RETURN_SOURCES = ['app', 'tpv', 'web', 'manual'];
export const SOURCE_LABELS = { app: 'Local', tpv: 'TPV', web: 'Web', manual: 'Sin ticket' };
export const OTHER_REASON = 'Otro';

const pesos = (n) => `$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;

export const maxReturnable = (pl) => Math.max(0, (pl.qtyBought ?? 0) - (pl.qtyReturnedBefore ?? 0));

const lineKey = (l) => `${l.source}:${l.purchaseLineId ?? `p${l.productId}`}`;

export function validateReturnLine(rl, { destinationIds, reasons }) {
  const errors = [];
  const sku = rl.sku ?? 'un producto';
  if (!RETURN_SOURCES.includes(rl.source)) errors.push(`${sku}: origen de la compra inválido`);
  if (!Number.isInteger(rl.qty) || rl.qty < 1) errors.push(`${sku}: cantidad inválida`);
  else if (rl.source !== 'manual' && rl.qty > maxReturnable(rl)) errors.push(`${sku}: se pueden devolver hasta ${maxReturnable(rl)}`);
  if (!Number.isFinite(rl.unitValue) || rl.unitValue < 0) errors.push(`${sku}: valor inválido`);
  if (!destinationIds.includes(rl.destinationId)) errors.push(`${sku}: elegí el destino`);
  if (!reasons.includes(rl.reason)) errors.push(`${sku}: elegí el motivo`);
  else if (rl.reason === OTHER_REASON && !String(rl.reasonNote ?? '').trim()) errors.push(`${sku}: con "Otro" escribí el motivo`);
  return errors;
}

export function nextReturnLineId(returnLines) {
  const max = returnLines.reduce((m, l) => Math.max(m, Number(String(l.rlId ?? '').replace('R', '')) || 0), 0);
  return `R${max + 1}`;
}

export function buildReturnLine(purchaseLine, { qty = 1, destinationId, reason, reasonNote = '' }, returnLines, ctx) {
  if (returnLines.some((l) => lineKey(l) === lineKey(purchaseLine))) {
    throw new Error(`${purchaseLine.sku} ya está en lo que vuelve: cambiá la cantidad`);
  }
  const rl = {
    ...purchaseLine, rlId: nextReturnLineId(returnLines), qty, destinationId, reason,
    reasonNote: String(reasonNote ?? '').trim().slice(0, 200),
  };
  const errors = validateReturnLine(rl, ctx);
  if (errors.length) throw new Error(errors.join('; '));
  return rl;
}

export function editReturnLine(rl, changes, ctx) {
  const next = { ...rl };
  for (const field of ['qty', 'destinationId', 'reason', 'reasonNote']) {
    if (changes[field] !== undefined) next[field] = field === 'reasonNote' ? String(changes[field]).trim().slice(0, 200) : changes[field];
  }
  const errors = validateReturnLine(next, ctx);
  if (errors.length) throw new Error(errors.join('; '));
  return next;
}

export const returnTotal = (returnLines) => round2((returnLines ?? []).reduce((s, l) => s + l.qty * l.unitValue, 0));

export function orderKind({ lines, returnLines }) {
  if (!returnLines?.length) return 'venta';
  return activeLines(lines).length ? 'cambio' : 'devolucion';
}

// Valor unitario con IVA de lo que pagó el cliente.
export const appUnitValue = (line, lineDiscountPct) => round2(line.basePrice * (1 - (lineDiscountPct ?? 0) / 100));
export const tpvUnitValue = (posLine) => (posLine.qty > 0 ? round2(posLine.price_subtotal_incl / posLine.qty) : 0);
export const webUnitValue = (saleLine) => (saleLine.product_uom_qty > 0 ? round2(saleLine.price_total / saleLine.product_uom_qty) : 0);

// Neto negativo: hay que devolverle al cliente -net, repartido entre reintegro
// (por medio) y saldo a favor. Tiene que sumar exacto.
export function validateRefund(refund, net, methodsById) {
  if (!(net < 0)) return null;
  const due = round2(-net);
  if (!refund) throw new Error('Elegí cómo se devuelve: reintegro y/o saldo a favor');
  const seen = new Set();
  const cashBack = (refund.cashBack ?? []).map(({ methodId, amount }) => {
    const method = methodsById.get(methodId);
    if (!method || method.active === false || methodId === 'saldo') throw new Error(`Medio de reintegro inválido: ${methodId}`);
    if (seen.has(methodId)) throw new Error(`${method.label} está repetido en el reintegro`);
    seen.add(methodId);
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) throw new Error(`Monto de reintegro inválido para ${method.label}`);
    return { methodId, amount: round2(n) };
  });
  const credit = round2(Number(refund.credit ?? 0));
  if (!Number.isFinite(credit) || credit < 0) throw new Error('Saldo a favor inválido');
  const sum = round2(cashBack.reduce((s, c) => s + c.amount, 0) + credit);
  if (Math.abs(sum - due) >= 0.01) throw new Error(`El reintegro suma ${pesos(sum)} y hay que devolver ${pesos(due)}: corregí los montos`);
  return { cashBack, credit };
}

export function invoiceGroups(returnLines) {
  const groups = new Map();
  for (const l of returnLines ?? []) {
    if (!l.invoiceId) continue;
    if (!groups.has(l.invoiceId)) groups.set(l.invoiceId, { invoiceId: l.invoiceId, invoiceName: l.invoiceName, lines: [] });
    groups.get(l.invoiceId).lines.push(l);
  }
  return [...groups.values()];
}
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `cd Reportes/backend && node --test test/posReturns.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add posReturns.mjs test/posReturns.test.mjs
git commit -m "feat(pos): modelo de la línea que vuelve, topes y reintegro

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Precios de un cambio — descuento solo sobre la diferencia

**Files:**
- Modify: `Reportes/backend/posPricing.mjs`
- Test: `Reportes/backend/test/posPricing.test.mjs`

**Interfaces:**
- Produces:
  - `computeExchangeTotals({ lines, payments, methodsById, extraDiscount, shippingAmount, homeServiceAmount, returnValue }) → { products, returnValue, paymentPct, paymentDiscount, subtotal, extraDiscount, shipping, homeService, total, lineDiscountPct, net, collect }`
    - `total` = total de la factura nueva (lo nuevo con su descuento); `net = total − returnValue`; `collect = max(net, 0)`.
  - `collectOf(totals) → number` (= `totals.collect ?? totals.total ?? 0`)

Fórmula: con `P` = productos nuevos, `R` = valor de lo que vuelve, `p` = % del medio de pago, la diferencia `D = max(0, P − R)`; descuento del medio = `D × p`; descuento extra sobre `D − D×p`; el % de línea para Odoo = `(descuento del medio + extra) / P`. Así la factura nueva menos la NC da exactamente lo que paga el cliente.

- [ ] **Step 1: Tests que fallan** (al final de `test/posPricing.test.mjs`; agregar `computeExchangeTotals, collectOf` al import)

```js
const mById = new Map([
  ['efectivo', { id: 'efectivo', discountPct: 15 }],
  ['credito', { id: 'credito', discountPct: 0 }],
  ['saldo', { id: 'saldo', discountPct: 0 }],
]);
const newLine = (basePrice, qty = 1) => ({ status: 'activo', basePrice, qty });

test('computeExchangeTotals: el descuento de efectivo va solo sobre la diferencia', () => {
  const t = computeExchangeTotals({ lines: [newLine(30000)], payments: [{ methodId: 'efectivo' }], methodsById: mById, returnValue: 20000 });
  assert.equal(t.paymentDiscount, 1500); // 15 % de 10.000
  assert.equal(t.lineDiscountPct, 5); // 1.500 / 30.000
  assert.equal(t.total, 28500);
  assert.equal(t.net, 8500);
  assert.equal(t.collect, 8500);
});

test('computeExchangeTotals: lo que vuelve vale más que lo nuevo → neto negativo, sin descuento', () => {
  const t = computeExchangeTotals({ lines: [newLine(10000)], payments: [], methodsById: mById, returnValue: 25000 });
  assert.equal(t.lineDiscountPct, 0);
  assert.equal(t.total, 10000);
  assert.equal(t.net, -15000);
  assert.equal(t.collect, 0);
});

test('computeExchangeTotals: devolución sola', () => {
  const t = computeExchangeTotals({ lines: [], payments: [], methodsById: mById, returnValue: 5990 });
  assert.equal(t.products, 0);
  assert.equal(t.total, 0);
  assert.equal(t.net, -5990);
});

test('computeExchangeTotals: el envío se suma sin descuento', () => {
  const t = computeExchangeTotals({ lines: [newLine(30000)], payments: [{ methodId: 'efectivo' }], methodsById: mById, returnValue: 20000, shippingAmount: 5000 });
  assert.equal(t.total, 33500);
  assert.equal(t.net, 13500);
});

test('computeExchangeTotals: descuento extra sobre la diferencia ya descontada', () => {
  const t = computeExchangeTotals({
    lines: [newLine(30000)], payments: [{ methodId: 'efectivo' }], methodsById: mById, returnValue: 20000,
    extraDiscount: { type: 'pct', value: 10 },
  });
  // 10 % de 8.500 = 850 → % de línea 2.350 / 30.000 = 7,83 (Odoo guarda 2
  // decimales) → el total sale de ese % para coincidir con la factura.
  assert.equal(t.lineDiscountPct, 7.83);
  assert.equal(t.total, 27651);
  assert.equal(t.extraDiscount, 849);
  assert.equal(t.net, 7651);
});

test('collectOf: venta usa total; cambio usa collect', () => {
  assert.equal(collectOf({ total: 100 }), 100);
  assert.equal(collectOf({ total: 100, collect: 0 }), 0);
  assert.equal(collectOf(null), 0);
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `cd Reportes/backend && node --test test/posPricing.test.mjs`
Expected: FAIL (`computeExchangeTotals is not a function`).

- [ ] **Step 3: Implementar** (al final de `posPricing.mjs`; `computeTotals` NO se toca)

```js
// Cambio: lo nuevo se factura completo y la NC de lo que vuelve se aplica a
// esa factura. Los descuentos por medio de pago y el extra van solo sobre la
// diferencia que paga el cliente; se traducen a un único % de línea para
// Odoo, así factura nueva − NC = lo que paga.
export function computeExchangeTotals({
  lines, payments, methodsById, extraDiscount = null, shippingAmount = 0, homeServiceAmount = 0, returnValue = 0,
}) {
  const active = (lines ?? []).filter((l) => l.status !== 'eliminado');
  const products = round2(active.reduce((sum, l) => sum + l.qty * l.basePrice, 0));
  const back = round2(returnValue ?? 0);
  if (!Number.isFinite(back) || back < 0) throw new Error('Valor de lo que vuelve inválido');
  const difference = round2(Math.max(0, products - back));
  const paymentPct = difference > 0 ? paymentDiscountPct(payments, methodsById) : 0;
  const paymentDiscount = round2(difference * paymentPct / 100);
  const extraAmount = extraDiscountAmount(extraDiscount, round2(difference - paymentDiscount));
  const ship = shippingAmount ?? 0;
  if (!Number.isFinite(ship) || ship < 0) throw new Error('Costo de envío inválido');
  const home = homeServiceAmount ?? 0;
  if (!Number.isFinite(home) || home < 0) throw new Error('Subida al domicilio inválida');
  const shipping = round2(ship);
  const homeService = round2(home);
  const lineDiscountPct = products > 0 ? round2(100 * (paymentDiscount + extraAmount) / products) : 0;
  const goods = round2(products * (1 - lineDiscountPct / 100));
  const total = round2(goods + shipping + homeService);
  const net = round2(total - back);
  return {
    products, returnValue: back, paymentPct, paymentDiscount, subtotal: round2(products - paymentDiscount),
    extraDiscount: round2(products - paymentDiscount - goods), shipping, homeService, total, lineDiscountPct,
    net, collect: Math.max(0, net),
  };
}

export const collectOf = (totals) => totals?.collect ?? totals?.total ?? 0;
```

- [ ] **Step 4: Correr todo**

Run: `cd Reportes/backend && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add posPricing.mjs test/posPricing.test.mjs
git commit -m "feat(pos): totales de un cambio con descuento sobre la diferencia

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Odoo — buscar y leer compras (TPV, web, app)

**Files:**
- Create: `Reportes/backend/posReturnsOdoo.mjs` (parte de lectura)
- Test: `Reportes/backend/test/posReturnsOdoo.test.mjs`

**Interfaces:**
- Consumes: `defaultOdoo` (posOdoo: `{ read, write }`), `tpvUnitValue`, `webUnitValue`, `appUnitValue` (posReturns).
- Produces:
  - `PurchaseSummary = { source, purchaseId: string, label, date: string, partnerName, total, invoiceName }`
  - `Purchase = { source, purchaseId, label, date, partnerVat, partnerName, invoiceId, invoiceName, lines: PurchaseLine[], pending: [{ sku, name, qty }] }`
  - `searchTpvPurchases({ doc, ref, sinceISO }, odoo?) → PurchaseSummary[]`
  - `searchWebPurchases({ doc, ref, sinceISO }, odoo?) → PurchaseSummary[]`
  - `readTpvPurchase(posOrderId, odoo?) → Purchase`
  - `readSaleOrderPurchase({ source, purchaseId, label, saleOrderIds, unitValueFor }, odoo?) → Purchase` (web y app; `unitValueFor(saleLine) → number`)
  - `allocateReturned(lines, returnedByProduct) → Map<lineId, qty>` (puro)
  - `returnedQtyByMove(moveIds, odoo?) → Map<moveId, qty>`

Reglas (spike): ticket TPV `pos.order` con `refunded_qty` por línea (reembolsos del POS nativo) + devoluciones hechas por la app sobre los moves de su remito; pedido de venta: solo cuenta lo entregado (moves `done` hacia clientes); lo no entregado va a `pending` (no se devuelve: se anula esa parte). Las líneas sin ningún move (servicios, envío) no se listan.

- [ ] **Step 1: Tests que fallan** — `test/posReturnsOdoo.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  allocateReturned, readTpvPurchase, readSaleOrderPurchase, searchTpvPurchases, searchWebPurchases,
} from '../posReturnsOdoo.mjs';

// Odoo falso: responde por modelo+método con funciones (domain, kwargs) → filas.
function fakeOdoo(handlers) {
  const calls = [];
  const run = async (model, method, args = [], kwargs = {}) => {
    calls.push([model, method, structuredClone(args), structuredClone(kwargs)]);
    const h = handlers[`${model}.${method}`];
    if (!h) throw new Error(`sin handler: ${model}.${method}`);
    return h(args, kwargs);
  };
  return { odoo: { read: run, write: run }, calls };
}

test('allocateReturned: reparte lo devuelto de un producto entre sus líneas en orden', () => {
  const lines = [{ id: 1, productId: 5, qty: 2 }, { id: 2, productId: 5, qty: 3 }, { id: 3, productId: 6, qty: 1 }];
  assert.deepEqual([...allocateReturned(lines, new Map([[5, 3], [6, 0]]))], [[1, 2], [2, 1], [3, 0]]);
});

test('readTpvPurchase: líneas con valor pagado, reembolsado por el POS + devuelto por la app, lotes y factura', async () => {
  const { odoo } = fakeOdoo({
    'pos.order.read': () => [{ id: 48870, name: 'Alcorta/2301', date_order: '2026-10-15 23:59:26', partner_id: [92036, 'GENARO'], account_move: [368292, 'FA-B 00012-00001533'], picking_ids: [193125], lines: [92250] }],
    'res.partner.read': () => [{ id: 92036, vat: '20123456789', name: 'GENARO' }],
    'account.move.read': () => [{ id: 368292, name: 'FA-B 00012-00001533', state: 'posted', move_type: 'out_invoice' }],
    'pos.order.line.read': () => [{ id: 92250, product_id: [68926, '[IME031FS] LAMPARA'], qty: 2, price_subtotal_incl: 105980, refunded_qty: 1 }],
    'stock.move.search_read': (args) => (JSON.stringify(args).includes('origin_returned_move_id')
      ? [{ id: 900, origin_returned_move_id: [700, 'x'], quantity_done: 0 }]
      : [{ id: 700, product_id: [68926, 'x'], quantity_done: 2, move_line_ids: [800], picking_id: [193125, 'AL/POS/02628'] }]),
    'stock.move.line.read': () => [{ id: 800, move_id: [700, 'x'], lot_id: [17050, 'L1'], qty_done: 2 }],
    'product.product.read': () => [{ id: 68926, default_code: 'IME031FS', name: 'LAMPARA' }],
  });
  const p = await readTpvPurchase(48870, odoo);
  assert.equal(p.source, 'tpv');
  assert.equal(p.invoiceId, 368292);
  assert.equal(p.partnerVat, '20123456789');
  assert.equal(p.lines.length, 1);
  const [l] = p.lines;
  assert.equal(l.purchaseLineId, '92250');
  assert.equal(l.qtyBought, 2);
  assert.equal(l.qtyReturnedBefore, 1);
  assert.equal(l.unitValue, 52990);
  assert.deepEqual(l.moveIds, [700]);
  assert.deepEqual(l.lots, [{ lotId: 17050, qty: 2 }]);
  assert.equal(l.sku, 'IME031FS');
});

test('readSaleOrderPurchase: solo lo entregado se puede devolver; lo pendiente se informa; servicios fuera', async () => {
  const { odoo } = fakeOdoo({
    'sale.order.read': () => [{ id: 63677, name: 'TN2095995525', date_order: '2026-10-16 12:42:07', partner_id: [92052, 'Gabriel'], invoice_ids: [368698], order_line: [1, 2, 3] }],
    'res.partner.read': () => [{ id: 92052, vat: '30111222', name: 'Gabriel' }],
    'account.move.read': () => [{ id: 368698, name: 'FA-B 00009-00034244', state: 'posted', move_type: 'out_invoice' }],
    'sale.order.line.read': () => [
      { id: 1, product_id: [10, '[A] Vaso'], product_uom_qty: 3, price_total: 15000 },
      { id: 2, product_id: [11, '[B] Plato'], product_uom_qty: 1, price_total: 8000 },
      { id: 3, product_id: [4, '[Delivery_007] Envío'], product_uom_qty: 1, price_total: 9000 },
    ],
    'stock.move.search_read': (args) => {
      const s = JSON.stringify(args);
      if (s.includes('origin_returned_move_id')) return [{ id: 99, origin_returned_move_id: [71, 'x'], quantity_done: 1 }];
      return [
        { id: 71, sale_line_id: [1, 'x'], product_id: [10, 'x'], quantity_done: 2, state: 'done', location_dest_usage: 'customer', move_line_ids: [] },
        { id: 72, sale_line_id: [1, 'x'], product_id: [10, 'x'], quantity_done: 0, state: 'assigned', move_line_ids: [] },
        { id: 73, sale_line_id: [2, 'x'], product_id: [11, 'x'], quantity_done: 0, state: 'assigned', move_line_ids: [] },
      ];
    },
    'stock.move.line.read': () => [],
    'product.product.read': () => [{ id: 10, default_code: 'A', name: 'Vaso' }, { id: 11, default_code: 'B', name: 'Plato' }],
  });
  const p = await readSaleOrderPurchase({
    source: 'web', purchaseId: '63677', label: 'TN2095995525', saleOrderIds: [63677],
    unitValueFor: (sl) => Math.round(sl.price_total / sl.product_uom_qty),
  }, odoo);
  assert.equal(p.invoiceName, 'FA-B 00009-00034244');
  assert.deepEqual(p.lines.map((l) => [l.sku, l.qtyBought, l.qtyReturnedBefore, l.unitValue, l.moveIds]), [['A', 2, 1, 5000, [71]]]);
  assert.deepEqual(p.pending, [{ sku: 'A', name: 'Vaso', qty: 1 }, { sku: 'B', name: 'Plato', qty: 1 }]);
});

test('searchTpvPurchases: por documento busca el partner y trae tickets positivos del período', async () => {
  const { odoo, calls } = fakeOdoo({
    'res.partner.search': () => [92036],
    'pos.order.search_read': () => [{ id: 48870, name: 'Alcorta/2301', date_order: '2026-10-15 23:59:26', partner_id: [92036, 'GENARO'], amount_total: 52990, account_move: [368292, 'FA-B 00012-00001533 (Alcorta/2301)'] }],
  });
  const r = await searchTpvPurchases({ doc: '20123456789', sinceISO: '2025-10-16' }, odoo);
  assert.deepEqual(r, [{ source: 'tpv', purchaseId: '48870', label: 'Alcorta/2301', date: '2026-10-15 23:59:26', partnerName: 'GENARO', total: 52990, invoiceName: 'FA-B 00012-00001533' }]);
  const domain = JSON.stringify(calls.find((c) => c[0] === 'pos.order')[2]);
  assert.ok(domain.includes('"partner_id","child_of",[92036]'));
  assert.ok(domain.includes('"amount_total",">",0'));
});

test('searchWebPurchases: por número de Tiendanube con o sin "TN"', async () => {
  const { odoo, calls } = fakeOdoo({ 'sale.order.search_read': () => [] });
  await searchWebPurchases({ ref: '2095995525', sinceISO: '2025-10-16' }, odoo);
  await searchWebPurchases({ ref: 'TN2095995525', sinceISO: '2025-10-16' }, odoo);
  for (const c of calls) assert.ok(JSON.stringify(c[2]).includes('"name","=","TN2095995525"'));
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `cd Reportes/backend && node --test test/posReturnsOdoo.test.mjs`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar la parte de lectura de `posReturnsOdoo.mjs`**

```js
// Cambios y devoluciones en Odoo (spike Fase 2). Lectura: compras del POS
// nativo (pos.order), de Tiendanube y de la app (sale.order) con lo que se
// puede devolver. Escritura (Task 7): devoluciones de remito, ingreso suelto,
// transferencia, notas de crédito y su aplicación. Todo con `odoo` inyectable.
import { defaultOdoo } from './posOdoo.mjs';
import { tpvUnitValue } from './posReturns.mjs';

const id = (m2o) => (Array.isArray(m2o) ? m2o[0] : m2o || null);
const cleanName = (m2o) => (Array.isArray(m2o) ? String(m2o[1]).replace(/\s*\(.*\)$/, '') : null);
const skuOf = (display) => (/^\[([^\]]+)\]/.exec(display ?? '') ?? [])[1] ?? null;

// Lo devuelto de un producto se reparte entre sus líneas en el orden de la compra.
export function allocateReturned(lines, returnedByProduct) {
  const left = new Map(returnedByProduct);
  const result = new Map();
  for (const l of lines) {
    const take = Math.min(l.qty, left.get(l.productId) ?? 0);
    result.set(l.id, take);
    left.set(l.productId, (left.get(l.productId) ?? 0) - take);
  }
  return result;
}

export async function returnedQtyByMove(moveIds, odoo = defaultOdoo) {
  const result = new Map();
  if (!moveIds.length) return result;
  const returns = await odoo.read('stock.move', 'search_read', [[
    ['origin_returned_move_id', 'in', moveIds], ['state', '=', 'done'],
  ]], { fields: ['id', 'origin_returned_move_id', 'quantity_done'] });
  for (const r of returns) {
    const orig = id(r.origin_returned_move_id);
    result.set(orig, (result.get(orig) ?? 0) + r.quantity_done);
  }
  return result;
}

async function lotsByMove(moves, odoo) {
  const lineIds = moves.flatMap((m) => m.move_line_ids ?? []);
  const result = new Map();
  if (!lineIds.length) return result;
  const lines = await odoo.read('stock.move.line', 'read', [lineIds], { fields: ['id', 'move_id', 'lot_id', 'qty_done'] });
  for (const ml of lines) {
    if (!ml.lot_id) continue;
    const moveId = id(ml.move_id);
    if (!result.has(moveId)) result.set(moveId, []);
    result.get(moveId).push({ lotId: id(ml.lot_id), qty: ml.qty_done });
  }
  return result;
}

const mergeLots = (lists) => {
  const byLot = new Map();
  for (const { lotId, qty } of lists.flat()) byLot.set(lotId, (byLot.get(lotId) ?? 0) + qty);
  return [...byLot].map(([lotId, qty]) => ({ lotId, qty }));
};

async function postedInvoice(moveIds, odoo) {
  if (!moveIds.length) return null;
  const moves = await odoo.read('account.move', 'read', [moveIds], { fields: ['id', 'name', 'state', 'move_type'] });
  return moves.find((m) => m.move_type === 'out_invoice' && m.state === 'posted') ?? null;
}

async function productsById(productIds, odoo) {
  const rows = productIds.length ? await odoo.read('product.product', 'read', [[...new Set(productIds)]], { fields: ['id', 'default_code', 'name'] }) : [];
  return new Map(rows.map((p) => [p.id, p]));
}

async function partnerOf(partnerM2o, odoo) {
  if (!partnerM2o) return { partnerVat: null, partnerName: null };
  const [p] = await odoo.read('res.partner', 'read', [[id(partnerM2o)]], { fields: ['id', 'vat', 'name'] });
  return { partnerVat: p?.vat ? String(p.vat).replace(/\D/g, '') : null, partnerName: p?.name ?? partnerM2o[1] };
}

async function partnerDomain(doc, odoo) {
  const ids = await odoo.read('res.partner', 'search', [[['vat', '=', doc]]], { limit: 20 });
  return ids.length ? [['partner_id', 'child_of', ids]] : null;
}

// ---- Búsqueda ----

export async function searchTpvPurchases({ doc, ref, sinceISO }, odoo = defaultOdoo) {
  const domain = [['amount_total', '>', 0], ['date_order', '>=', sinceISO]];
  if (doc) {
    const byPartner = await partnerDomain(doc, odoo);
    if (!byPartner) return [];
    domain.push(...byPartner);
  } else {
    domain.push('|', ['name', 'ilike', ref], ['pos_reference', 'ilike', ref]);
  }
  const rows = await odoo.read('pos.order', 'search_read', [domain], {
    fields: ['id', 'name', 'date_order', 'partner_id', 'amount_total', 'account_move'], limit: 30, order: 'date_order desc',
  });
  return rows.map((o) => ({
    source: 'tpv', purchaseId: String(o.id), label: o.name, date: o.date_order, partnerName: o.partner_id ? o.partner_id[1] : null,
    total: o.amount_total, invoiceName: cleanName(o.account_move),
  }));
}

export async function searchWebPurchases({ doc, ref, sinceISO }, odoo = defaultOdoo) {
  const domain = [['name', '=like', 'TN%'], ['state', 'in', ['sale', 'done']], ['date_order', '>=', sinceISO]];
  if (doc) {
    const byPartner = await partnerDomain(doc, odoo);
    if (!byPartner) return [];
    domain.push(...byPartner);
  } else {
    const digits = String(ref).replace(/\D/g, '');
    if (!digits) return [];
    domain.push(['name', '=', `TN${digits}`]);
  }
  const rows = await odoo.read('sale.order', 'search_read', [domain], {
    fields: ['id', 'name', 'date_order', 'partner_id', 'amount_total', 'invoice_ids'], limit: 30, order: 'date_order desc',
  });
  return rows.map((o) => ({
    source: 'web', purchaseId: String(o.id), label: o.name, date: o.date_order, partnerName: o.partner_id ? o.partner_id[1] : null,
    total: o.amount_total, invoiceName: null,
  }));
}

// ---- Lectura de una compra ----

export async function readTpvPurchase(posOrderId, odoo = defaultOdoo) {
  const [order] = await odoo.read('pos.order', 'read', [[Number(posOrderId)]], {
    fields: ['id', 'name', 'date_order', 'partner_id', 'account_move', 'picking_ids', 'lines'],
  });
  if (!order) throw new Error('Ticket no encontrado');
  const [partner, invoice, posLines] = await Promise.all([
    partnerOf(order.partner_id, odoo),
    postedInvoice(order.account_move ? [id(order.account_move)] : [], odoo),
    odoo.read('pos.order.line', 'read', [order.lines], { fields: ['id', 'product_id', 'qty', 'price_subtotal_incl', 'refunded_qty'] }),
  ]);
  const moves = order.picking_ids.length ? await odoo.read('stock.move', 'search_read', [[
    ['picking_id', 'in', order.picking_ids], ['state', '=', 'done'],
  ]], { fields: ['id', 'product_id', 'quantity_done', 'move_line_ids', 'picking_id'] }) : [];
  const [returnedByMove, lots, products] = await Promise.all([
    returnedQtyByMove(moves.map((m) => m.id), odoo), lotsByMove(moves, odoo), productsById(posLines.map((l) => id(l.product_id)), odoo),
  ]);
  const returnedByProduct = new Map();
  for (const m of moves) returnedByProduct.set(id(m.product_id), (returnedByProduct.get(id(m.product_id)) ?? 0) + (returnedByMove.get(m.id) ?? 0));
  const positive = posLines.filter((l) => l.qty > 0);
  const byApp = allocateReturned(positive.map((l) => ({ id: l.id, productId: id(l.product_id), qty: l.qty - (l.refunded_qty ?? 0) })), returnedByProduct);
  const lines = positive.map((l) => {
    const productId = id(l.product_id);
    const productMoves = moves.filter((m) => id(m.product_id) === productId);
    const product = products.get(productId);
    return {
      source: 'tpv', purchaseId: String(order.id), purchaseLabel: order.name, purchaseLineId: String(l.id), productId,
      sku: product?.default_code ?? skuOf(l.product_id[1]), name: product?.name ?? l.product_id[1],
      qtyBought: l.qty, qtyReturnedBefore: (l.refunded_qty ?? 0) + (byApp.get(l.id) ?? 0), unitValue: tpvUnitValue(l),
      lots: mergeLots(productMoves.map((m) => lots.get(m.id) ?? [])), moveIds: productMoves.map((m) => m.id),
      invoiceId: invoice?.id ?? null, invoiceName: invoice?.name ?? null, ...partner,
    };
  });
  return {
    source: 'tpv', purchaseId: String(order.id), label: order.name, date: order.date_order, ...partner,
    invoiceId: invoice?.id ?? null, invoiceName: invoice?.name ?? null, lines, pending: [],
  };
}

// Pedido(s) de venta: Tiendanube (uno) o venta de la app (uno por depósito).
export async function readSaleOrderPurchase({ source, purchaseId, label, saleOrderIds, unitValueFor }, odoo = defaultOdoo) {
  const orders = await odoo.read('sale.order', 'read', [saleOrderIds], {
    fields: ['id', 'name', 'date_order', 'partner_id', 'invoice_ids', 'order_line'],
  });
  if (!orders.length) throw new Error('Pedido no encontrado');
  const lineIds = orders.flatMap((o) => o.order_line);
  const [partner, invoice, saleLines] = await Promise.all([
    partnerOf(orders[0].partner_id, odoo),
    postedInvoice([...new Set(orders.flatMap((o) => o.invoice_ids))], odoo),
    odoo.read('sale.order.line', 'read', [lineIds], { fields: ['id', 'product_id', 'product_uom_qty', 'price_total'] }),
  ]);
  const allMoves = await odoo.read('stock.move', 'search_read', [[
    ['sale_line_id', 'in', lineIds], ['state', '!=', 'cancel'], ['location_dest_id.usage', '=', 'customer'],
  ]], { fields: ['id', 'sale_line_id', 'product_id', 'quantity_done', 'state', 'move_line_ids', 'picking_id'] });
  const done = allMoves.filter((m) => m.state === 'done');
  const [returnedByMove, lots, products] = await Promise.all([
    returnedQtyByMove(done.map((m) => m.id), odoo), lotsByMove(done, odoo), productsById(saleLines.map((l) => id(l.product_id)), odoo),
  ]);
  const lines = [];
  const pending = [];
  for (const sl of saleLines) {
    const moves = allMoves.filter((m) => id(m.sale_line_id) === sl.id);
    if (!moves.length) continue; // servicio / envío: no se devuelve stock
    const lineDone = moves.filter((m) => m.state === 'done');
    const delivered = lineDone.reduce((s, m) => s + m.quantity_done, 0);
    const product = products.get(id(sl.product_id));
    const sku = product?.default_code ?? skuOf(sl.product_id[1]);
    const name = product?.name ?? sl.product_id[1];
    if (sl.product_uom_qty > delivered) pending.push({ sku, name, qty: sl.product_uom_qty - delivered });
    if (!delivered) continue;
    lines.push({
      source, purchaseId, purchaseLabel: label, purchaseLineId: String(sl.id), productId: id(sl.product_id), sku, name,
      qtyBought: delivered, qtyReturnedBefore: lineDone.reduce((s, m) => s + (returnedByMove.get(m.id) ?? 0), 0),
      unitValue: unitValueFor(sl), lots: mergeLots(lineDone.map((m) => lots.get(m.id) ?? [])), moveIds: lineDone.map((m) => m.id),
      invoiceId: invoice?.id ?? null, invoiceName: invoice?.name ?? null, ...partner,
    });
  }
  return {
    source, purchaseId, label, date: orders[0].date_order, ...partner,
    invoiceId: invoice?.id ?? null, invoiceName: invoice?.name ?? null, lines, pending,
  };
}
```

Nota para el implementador: el handler falso del test de venta devuelve moves con `state`; el dominio real filtra `location_dest_id.usage = customer` en Odoo (no en código), por eso el test no lo verifica.

- [ ] **Step 4: Correr y ver que pasan**

Run: `cd Reportes/backend && node --test test/posReturnsOdoo.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add posReturnsOdoo.mjs test/posReturnsOdoo.test.mjs
git commit -m "feat(pos): leer compras del POS nativo, Tiendanube y la app para devolver

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Saldo a favor (`posCredits.mjs`)

**Files:**
- Create: `Reportes/backend/posCredits.mjs`
- Test: `Reportes/backend/test/posCredits.test.mjs`

**Interfaces:**
- Consumes: `getDb` (firestore.mjs), `round2`.
- Produces:
  - `CREDITS_COLLECTION = 'pos_credits'`
  - `SALDO_METHOD = { id: 'saldo', label: 'Saldo a favor', discountPct: 0, odooName: null, details: [], order: 99, active: true }`
  - `Credit = { customerDoc, customerName, partnerId, amount, balance, status: 'activo'|'agotado', localId, orderId, orderNumber, creditNoteIds: number[], createdAt, expiresAt: Date|null, movements: [{ type: 'alta'|'uso'|'devuelto'|'extension', amount?, orderId?, orderNumber?, by, at, reason?, expiresAt? }] }`
  - `creditExpiry(nowMs, days) → Date|null`
  - `isUsable(credit, nowMs) → boolean`
  - `allocateCredits(credits, amount, nowMs) → [{ creditId, amount }]` (tira si no alcanza)
  - `buildCredit({ order, amount, days, nowMs, user, creditNoteIds }) → Credit`
  - `applyAllocation(credit, part, { orderId, orderNumber, user, at }) → Partial<Credit>` (puro: `{ balance, status, movements }`)
  - `listCustomerCredits(docNumber) → (Credit & { id })[]`
  - `customerBalance(docNumber, nowMs) → { balance, credits }`
  - `consumeCreditsInTx(tx, db, { docNumber, amount, orderId, orderNumber, user, nowMs }) → { allocation, commit() }`
  - `restoreCreditsInTx(tx, db, allocation, { orderId, user }) → commit()` (leer antes, escribir después)
  - `createCreditInTx(tx, db, orderId, credit)`
  - `listCreditsForAdmin({ docNumber, expiredOnly, nowMs }) → Credit[]`
  - `extendCredit(creditId, { expiresAt, reason }, user, nowMs) → Credit`

- [ ] **Step 1: Tests que fallan** — `test/posCredits.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  creditExpiry, isUsable, allocateCredits, buildCredit, applyAllocation, consumeCreditsInTx,
} from '../posCredits.mjs';

const DAY = 864e5;
const NOW = Date.parse('2026-10-16T12:00:00-03:00');
const credit = (id, balance, expiresInDays, createdDaysAgo = 1) => ({
  id, balance, status: balance > 0 ? 'activo' : 'agotado', movements: [],
  expiresAt: expiresInDays == null ? null : new Date(NOW + expiresInDays * DAY),
  createdAt: new Date(NOW - createdDaysAgo * DAY),
});

test('creditExpiry: null = no vence', () => {
  assert.equal(creditExpiry(NOW, null), null);
  assert.equal(creditExpiry(NOW, 30).getTime(), NOW + 30 * DAY);
});

test('isUsable: con saldo y sin vencer', () => {
  assert.ok(isUsable(credit('a', 100, 5), NOW));
  assert.ok(isUsable(credit('a', 100, null), NOW));
  assert.ok(!isUsable(credit('a', 100, -1), NOW));
  assert.ok(!isUsable(credit('a', 0, 5), NOW));
});

test('allocateCredits: primero el que vence antes; los que no vencen al final; vencidos no', () => {
  const credits = [credit('sinVto', 500, null), credit('pronto', 300, 2), credit('tarde', 400, 20), credit('vencido', 999, -3)];
  assert.deepEqual(allocateCredits(credits, 600, NOW), [{ creditId: 'pronto', amount: 300 }, { creditId: 'tarde', amount: 300 }]);
  assert.throws(() => allocateCredits(credits, 1300, NOW), /tiene \$ 1\.200 de saldo a favor y se quiere usar \$ 1\.300/);
});

test('buildCredit y applyAllocation', () => {
  const order = { id: 'o1', number: 'LL-0042', localId: 'LL', customer: { docNumber: '30123456', name: 'Ana', odooPartnerId: 91779 } };
  const c = buildCredit({ order, amount: 1000, days: 30, nowMs: NOW, user: 'Caja LL', creditNoteIds: [5] });
  assert.equal(c.customerDoc, '30123456');
  assert.equal(c.balance, 1000);
  assert.equal(c.status, 'activo');
  assert.equal(c.expiresAt.getTime(), NOW + 30 * DAY);
  assert.equal(c.movements[0].type, 'alta');
  const used = applyAllocation({ ...c, id: 'o1' }, 1000, { orderId: 'o2', orderNumber: 'BL-0003', user: 'Caja BL', at: new Date(NOW) });
  assert.equal(used.balance, 0);
  assert.equal(used.status, 'agotado');
  assert.equal(used.movements.at(-1).type, 'uso');
});

// Transacción falsa: guarda escrituras para verlas después.
function fakeTx(docs) {
  const writes = [];
  return {
    writes,
    tx: {
      get: async () => ({ docs: docs.map((d) => ({ id: d.id, data: () => d })) }),
      update: (ref, data) => writes.push([ref.id, data]),
    },
    db: { collection: () => ({ where: () => ({}), doc: (id) => ({ id }) }) },
  };
}

test('consumeCreditsInTx: descuenta en la misma transacción; si no alcanza, tira antes de escribir', async () => {
  const { tx, db, writes } = fakeTx([credit('pronto', 300, 2), credit('tarde', 400, 20)]);
  const { allocation, commit } = await consumeCreditsInTx(tx, db, { docNumber: '30123456', amount: 500, orderId: 'o9', orderNumber: 'LL-0050', user: 'Caja', nowMs: NOW });
  assert.deepEqual(allocation, [{ creditId: 'pronto', amount: 300 }, { creditId: 'tarde', amount: 200 }]);
  assert.equal(writes.length, 0);
  commit();
  assert.deepEqual(writes.map(([id, d]) => [id, d.balance]), [['pronto', 0], ['tarde', 200]]);
  const second = fakeTx([credit('pronto', 0, 2), credit('tarde', 200, 20)]);
  await assert.rejects(consumeCreditsInTx(second.tx, second.db, { docNumber: '30123456', amount: 500, orderId: 'o10', orderNumber: 'LL-0051', user: 'Caja', nowMs: NOW }), /saldo a favor/);
  assert.equal(second.writes.length, 0);
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `cd Reportes/backend && node --test test/posCredits.test.mjs`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `posCredits.mjs`**

```js
// Saldo a favor del cliente (pos_credits): un documento por crédito generado
// en una devolución o cambio. Se usa en cualquier local como medio de pago
// ("saldo"), primero el que vence antes. El documento fiscal (NC) vive en
// Odoo; el saldo y su vencimiento, acá (la app no registra cobros en Odoo).
import { getDb } from './firestore.mjs';
import { round2 } from './posPricing.mjs';

export const CREDITS_COLLECTION = 'pos_credits';
export const SALDO_METHOD = { id: 'saldo', label: 'Saldo a favor', discountPct: 0, odooName: null, details: [], order: 99, active: true };

const DAY = 864e5;
const ms = (v) => (v == null ? null : v.toMillis ? v.toMillis() : new Date(v).getTime());
const pesos = (n) => `$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
const withId = (snap) => ({ id: snap.id, ...snap.data() });

export const creditExpiry = (nowMs, days) => (days ? new Date(nowMs + days * DAY) : null);

export function isUsable(credit, nowMs) {
  const expires = ms(credit.expiresAt);
  return credit.balance > 0 && (expires == null || expires > nowMs);
}

const byExpiry = (a, b) => (ms(a.expiresAt) ?? Infinity) - (ms(b.expiresAt) ?? Infinity) || ms(a.createdAt) - ms(b.createdAt);

export function allocateCredits(credits, amount, nowMs) {
  const usable = credits.filter((c) => isUsable(c, nowMs)).sort(byExpiry);
  const available = round2(usable.reduce((s, c) => s + c.balance, 0));
  const wanted = round2(amount);
  if (wanted > available + 0.001) {
    throw new Error(`El cliente tiene ${pesos(available)} de saldo a favor y se quiere usar ${pesos(wanted)}`);
  }
  const allocation = [];
  let left = wanted;
  for (const c of usable) {
    if (left <= 0) break;
    const take = round2(Math.min(c.balance, left));
    allocation.push({ creditId: c.id, amount: take });
    left = round2(left - take);
  }
  return allocation;
}

export function buildCredit({ order, amount, days, nowMs, user, creditNoteIds = [] }) {
  const at = new Date(nowMs);
  return {
    customerDoc: String(order.customer.docNumber).replace(/\D/g, ''), customerName: order.customer.name,
    partnerId: order.customer.odooPartnerId ?? null, amount: round2(amount), balance: round2(amount), status: 'activo',
    localId: order.localId, orderId: order.id, orderNumber: order.number, creditNoteIds,
    createdAt: at, expiresAt: creditExpiry(nowMs, days),
    movements: [{ type: 'alta', amount: round2(amount), orderId: order.id, orderNumber: order.number, by: user, at }],
  };
}

export function applyAllocation(credit, part, { orderId, orderNumber, user, at, type = 'uso' }) {
  const sign = type === 'devuelto' ? 1 : -1;
  const balance = round2(credit.balance + sign * part);
  return {
    balance, status: balance > 0 ? 'activo' : 'agotado',
    movements: [...(credit.movements ?? []), { type, amount: round2(part), orderId, orderNumber, by: user, at }],
  };
}

// ---- Firestore ----

const creditsQuery = (db, docNumber) => db.collection(CREDITS_COLLECTION).where('customerDoc', '==', String(docNumber).replace(/\D/g, ''));

export async function listCustomerCredits(docNumber) {
  const snap = await creditsQuery(getDb(), docNumber).get();
  return snap.docs.map(withId);
}

export async function customerBalance(docNumber, nowMs = Date.now()) {
  const credits = (await listCustomerCredits(docNumber)).filter((c) => isUsable(c, nowMs)).sort(byExpiry);
  return { balance: round2(credits.reduce((s, c) => s + c.balance, 0)), credits };
}

// Lee DENTRO de la transacción y devuelve la escritura para después de todas
// las lecturas (regla de Firestore). Dos cajas no gastan el mismo saldo.
export async function consumeCreditsInTx(tx, db, { docNumber, amount, orderId, orderNumber, user, nowMs }) {
  const snap = await tx.get(creditsQuery(db, docNumber));
  const credits = snap.docs.map(withId);
  const allocation = allocateCredits(credits, amount, nowMs);
  const commit = () => {
    for (const part of allocation) {
      const c = credits.find((x) => x.id === part.creditId);
      tx.update(db.collection(CREDITS_COLLECTION).doc(c.id), applyAllocation(c, part.amount, { orderId, orderNumber, user, at: new Date(nowMs) }));
    }
  };
  return { allocation, commit };
}

export async function restoreCreditsInTx(tx, db, allocation, { orderId, orderNumber, user }) {
  const refs = allocation.map((p) => db.collection(CREDITS_COLLECTION).doc(p.creditId));
  const snaps = refs.length ? await tx.getAll(...refs) : [];
  return () => snaps.forEach((snap, i) => {
    if (!snap.exists) return;
    tx.update(refs[i], applyAllocation(withId(snap), allocation[i].amount, { orderId, orderNumber, user, at: new Date(), type: 'devuelto' }));
  });
}

// id = id de la operación: un reintento no crea un segundo saldo.
export function createCreditInTx(tx, db, orderId, credit) {
  tx.set(db.collection(CREDITS_COLLECTION).doc(orderId), credit);
}

export async function listCreditsForAdmin({ docNumber = null, expiredOnly = false, nowMs = Date.now() } = {}) {
  const db = getDb();
  const snap = docNumber ? await creditsQuery(db, docNumber).get() : await db.collection(CREDITS_COLLECTION).where('status', '==', 'activo').get();
  let credits = snap.docs.map(withId);
  if (expiredOnly) credits = credits.filter((c) => c.balance > 0 && ms(c.expiresAt) != null && ms(c.expiresAt) <= nowMs);
  return credits.sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
}

export async function extendCredit(creditId, { expiresAt, reason }, user, nowMs = Date.now()) {
  const text = String(reason ?? '').trim().slice(0, 200);
  if (!text) throw new Error('Escribí el motivo de la extensión');
  const next = expiresAt == null || expiresAt === '' ? null : new Date(expiresAt);
  if (next && (Number.isNaN(next.getTime()) || next.getTime() <= nowMs)) throw new Error('La nueva fecha de vencimiento tiene que ser futura');
  const db = getDb();
  const ref = db.collection(CREDITS_COLLECTION).doc(creditId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('Saldo no encontrado');
    const credit = withId(snap);
    const update = {
      expiresAt: next,
      movements: [...(credit.movements ?? []), { type: 'extension', expiresAt: next, reason: text, by: user, at: new Date(nowMs) }],
    };
    tx.update(ref, update);
    return { ...credit, ...update };
  });
}
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `cd Reportes/backend && node --test test/posCredits.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add posCredits.mjs test/posCredits.test.mjs
git commit -m "feat(pos): saldo a favor con vencimiento y consumo en transacción

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Pedidos con "lo que vuelve" (`posOrders.mjs`)

**Files:**
- Modify: `Reportes/backend/posOrders.mjs`, `Reportes/backend/posConfig.mjs` (solo `getPaymentMethodsById`)
- Test: `Reportes/backend/test/posOrders.test.mjs`

**Interfaces:**
- Consumes: Task 1 (`returnDestinationsOf`), Task 2 (`buildReturnLine`, `editReturnLine`, `returnTotal`, `orderKind`, `validateRefund`), Task 3 (`computeExchangeTotals`, `collectOf`), Task 5 (`SALDO_METHOD`, `consumeCreditsInTx`, `restoreCreditsInTx`, `createCreditInTx`, `buildCredit`).
- Produces (nuevos campos de `pos_orders`): `kind`, `returnLines: ReturnLine[]`, `refund: { cashBack, credit } | null`, `creditAllocation: [{ creditId, amount }] | null`, `holderChangeReason: string`, `returnSteps: object`.
- Funciones nuevas/cambiadas:
  - `priceOrder(order, opts)` → usa `computeExchangeTotals` si hay `returnLines`.
  - `claimPricing(order, opts)` → pagos contra `collectOf(totals)`; sin pagos si `collect = 0`.
  - `returnCtx(locale, settings) → { destinationIds, reasons }` (puro)
  - `assertHolder(order) → void` (puro; tira si el titular de la compra no es el cliente y no hay motivo)
  - `saldoAmount(payments, totals) → number` (puro; cuánto se paga con saldo)
  - `createReturnCart(user, purchaseLine, input) → order`
  - `addReturnLine(orderId, user, purchaseLine, input) → order`
  - `updateReturnLine(orderId, user, rlId, changes) → order`
  - `removeReturnLine(orderId, user, rlId) → order`
  - `saveReturnSteps(id, returnSteps)`, `saveAppliedCreditNotes(id, ids)`
  - `searchAppPurchases({ doc, number }) → order[]`
  - `getPaymentMethodsById()` (posConfig) incluye `SALDO_METHOD`.

- [ ] **Step 1: Tests que fallan** (al final de `test/posOrders.test.mjs`; agregar al import `returnCtx, assertHolder, saldoAmount`)

```js
import { returnCtx, assertHolder, saldoAmount } from '../posOrders.mjs';
import { DEFAULT_LOCALES, DEFAULT_SETTINGS } from '../posConfig.mjs';

const exMethods = new Map([
  ['efectivo', { id: 'efectivo', label: 'Efectivo', discountPct: 15, details: [] }],
  ['saldo', { id: 'saldo', label: 'Saldo a favor', discountPct: 0, details: [] }],
]);
const rl = { rlId: 'R1', source: 'tpv', qty: 1, unitValue: 20000, partnerVat: '30123456', destinationId: 'stock' };

test('priceOrder: con lo que vuelve calcula el cambio (descuento sobre la diferencia)', () => {
  const order = {
    lines: [{ lineId: 'L1', status: 'activo', qty: 1, basePrice: 30000, delivery: 'ahora' }],
    returnLines: [rl], payments: [{ methodId: 'efectivo' }], customer: { tagIds: [] },
  };
  const { totals } = priceOrder(order, { methodsById: exMethods, promotions: [], now: Date.now() });
  assert.equal(totals.net, 8500);
  assert.equal(totals.collect, 8500);
});

test('claimPricing: devolución sola no pide medio de pago; cambio cobra solo el neto', () => {
  const devolucion = { lines: [], returnLines: [rl], payments: [], customer: { tagIds: [] } };
  const a = claimPricing(devolucion, { methodsById: exMethods, promotions: [], now: Date.now() });
  assert.deepEqual(a.payments, []);
  assert.equal(a.totals.net, -20000);
  const cambio = {
    lines: [{ lineId: 'L1', status: 'activo', qty: 1, basePrice: 30000, delivery: 'ahora' }], returnLines: [rl],
    payments: [{ methodId: 'efectivo', amount: 4000 }, { methodId: 'saldo', amount: 4500 }], customer: { tagIds: [] },
  };
  // con saldo en el pago dividido manda el 0 %: neto 10.000 sin descuento
  assert.throws(() => claimPricing(cambio, { methodsById: exMethods, promotions: [], now: Date.now() }), /suman \$ 8\.500 y el total es \$ 10\.000/);
});

test('returnCtx: destinos del local y motivos de ajustes', () => {
  const c = returnCtx(DEFAULT_LOCALES[0], DEFAULT_SETTINGS);
  assert.deepEqual(c.destinationIds, ['stock', 'exhibicion', 'rolon']);
  assert.deepEqual(c.reasons, DEFAULT_SETTINGS.returnReasons);
});

test('assertHolder: si la compra es de otro documento pide motivo', () => {
  const order = { customer: { docNumber: '30123456' }, returnLines: [rl], holderChangeReason: '' };
  assert.doesNotThrow(() => assertHolder(order));
  const other = { ...order, customer: { docNumber: '99888777' } };
  assert.throws(() => assertHolder(other), /La compra es de otro cliente/);
  assert.doesNotThrow(() => assertHolder({ ...other, holderChangeReason: 'Regalo, viene la hija' }));
  assert.doesNotThrow(() => assertHolder({ ...other, returnLines: [{ ...rl, partnerVat: null }] }));
});

test('saldoAmount: único medio usa lo que se cobra; dividido usa su monto', () => {
  assert.equal(saldoAmount([{ methodId: 'saldo', amount: null }], { collect: 7000, total: 9000 }), 7000);
  assert.equal(saldoAmount([{ methodId: 'efectivo', amount: 2000 }, { methodId: 'saldo', amount: 5000 }], { total: 7000 }), 5000);
  assert.equal(saldoAmount([{ methodId: 'efectivo', amount: null }], { total: 7000 }), 0);
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `cd Reportes/backend && node --test test/posOrders.test.mjs`
Expected: FAIL (`returnCtx` no exportada).

- [ ] **Step 3: `getPaymentMethodsById` con saldo** — en `posConfig.mjs`:

```js
import { SALDO_METHOD } from './posCredits.mjs';
```

y reemplazar `getPaymentMethodsById`:

```js
// "Saldo a favor" es un medio más (0 %, sin medio de Odoo propio): no se
// guarda en pos_payment_methods ni se edita desde Admin.
export async function getPaymentMethodsById() {
  return new Map([...(await getPaymentMethods()).map((m) => [m.id, m]), [SALDO_METHOD.id, SALDO_METHOD]]);
}
```

(`posCredits.mjs` no importa `posConfig.mjs`: no hay ciclo.)

- [ ] **Step 4: Funciones puras en `posOrders.mjs`**

Agregar imports:

```js
import { computeTotals, computeExchangeTotals, collectOf, round2 } from './posPricing.mjs';
import { returnDestinationsOf } from './posConfig.mjs';
import { buildReturnLine, editReturnLine, returnTotal, orderKind, validateRefund } from './posReturns.mjs';
import { consumeCreditsInTx, restoreCreditsInTx, createCreditInTx, buildCredit } from './posCredits.mjs';
```

(quitar el import viejo de `computeTotals, round2` para no duplicarlo; agregar `returnDestinationsOf` al import existente de `./posConfig.mjs`.)

Reemplazar `priceOrder` y `claimPricing`:

```js
export function priceOrder(order, { methodsById, promotions, now }) {
  const ctx = {
    paymentMethodIds: (order.payments ?? []).map((p) => p.methodId),
    customerTagIds: order.customer?.tagIds ?? [],
    now,
  };
  const extraDiscount = resolveExtraDiscount(promotions, order.discountChoice ?? {}, ctx);
  const args = {
    lines: order.lines, payments: order.payments ?? [], methodsById, extraDiscount,
    shippingAmount: needsShipping(order.lines) ? (order.shipping?.amount ?? 0) : 0,
    homeServiceAmount: needsShipping(order.lines) ? (order.shipping?.homeServiceAmount ?? 0) : 0,
  };
  const totals = order.returnLines?.length
    ? computeExchangeTotals({ ...args, returnValue: returnTotal(order.returnLines) })
    : computeTotals(args);
  return { extraDiscount, totals };
}

// Pedido que ya existe en Odoo: los precios quedaron fijos, no se recalculan.
export function claimPricing(order, { methodsById, promotions, now }) {
  if (order.odooOrderId && order.totals) {
    return { payments: order.payments, extraDiscount: order.extraDiscount ?? null, totals: order.totals };
  }
  const exchange = Boolean(order.returnLines?.length);
  const draft = exchange ? priceOrder({ ...order, payments: [] }, { methodsById, promotions, now }) : null;
  // Cambio/devolución sin nada para cobrar: no lleva medio de pago.
  if (exchange && collectOf(draft.totals) === 0) {
    const { extraDiscount, totals } = priceOrder({ ...order, payments: [] }, { methodsById, promotions, now });
    return { payments: [], extraDiscount, totals };
  }
  const payments = validatePayments(order.payments, methodsById);
  const { extraDiscount, totals } = priceOrder({ ...order, payments }, { methodsById, promotions, now });
  assertPaymentsMatchTotal(payments, collectOf(totals));
  return { payments, extraDiscount, totals };
}

export function returnCtx(locale, settings) {
  return { destinationIds: returnDestinationsOf(locale, settings).map((d) => d.id), reasons: settings.returnReasons };
}

// La NC y el saldo son del cliente de la compra original (spec §5.3).
export function assertHolder(order) {
  const doc = String(order.customer?.docNumber ?? '').replace(/\D/g, '');
  const others = (order.returnLines ?? []).filter((l) => l.partnerVat && l.partnerVat !== doc);
  if (others.length && !String(order.holderChangeReason ?? '').trim()) {
    throw new Error('La compra es de otro cliente: escribí el motivo del cambio de titular');
  }
}

export function saldoAmount(payments, totals) {
  const saldo = (payments ?? []).find((p) => p.methodId === 'saldo');
  if (!saldo) return 0;
  return payments.length === 1 || saldo.amount == null ? collectOf(totals) : saldo.amount;
}
```

Nota: el `draft` sin pagos en `claimPricing` sirve para saber si hay algo que cobrar (con pagos el % podría cambiar, pero `collect` = 0 solo pasa si lo que vuelve vale ≥ lo nuevo, y ahí no hay descuento).

- [ ] **Step 5: Correr los tests puros**

Run: `cd Reportes/backend && node --test test/posOrders.test.mjs`
Expected: PASS.

- [ ] **Step 6: Firestore — carrito/caja con lo que vuelve** (en `posOrders.mjs`)

En `createCart`, al objeto `order` agregar: `kind: 'venta', returnLines: [], refund: null, creditAllocation: null, holderChangeReason: '', returnSteps: {}`.

Agregar (después de `discardCart`):

```js
// ---- Lo que vuelve (cambio / devolución) ----
// No reserva stock: entra a Odoo recién al confirmar. `purchaseLine` siempre
// viene de posReturnsService (leída en el servidor).

async function returnLineCtx(localId) {
  const [locale, settings] = await Promise.all([getLocale(localId), getSettings()]);
  return returnCtx(locale, settings);
}

export async function createReturnCart(user, purchaseLine, input) {
  const ctx = await returnLineCtx(user.localId);
  const returnLine = buildReturnLine(purchaseLine, input, [], ctx);
  const db = getDb();
  const ref = db.collection(COLLECTION).doc();
  const now = new Date();
  const order = {
    localId: user.localId, sellerId: user.id, sellerName: user.name, status: 'carrito', lines: [], returnLines: [returnLine],
    kind: 'devolucion', refund: null, creditAllocation: null, holderChangeReason: '', returnSteps: {},
    customer: null, shipping: null, payments: [], discountChoice: null, extraDiscount: null, totals: null,
    wantsInvoice: false, notes: '', odooOrders: [], odooOrderId: null, createdAt: now, updatedAt: now,
  };
  Object.assign(order, orderKeys(order));
  await db.runTransaction(async (tx) => {
    const counter = await tx.get(counterRef(db, user.localId));
    const next = (counter.exists ? counter.data().next : 0) + 1;
    order.number = formatOrderNumber(user.localId, next);
    tx.set(counterRef(db, user.localId), { next });
    tx.set(ref, order);
  });
  return { id: ref.id, ...order };
}

async function changeReturnLines(orderId, user, change) {
  const db = getDb();
  const ref = db.collection(COLLECTION).doc(orderId);
  const first = await getOrder(orderId);
  const ctx = await returnLineCtx(first.localId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('Pedido no encontrado');
    const order = withId(snap);
    if (order.status === 'carrito') assertCartEditable(order, user);
    else {
      if (order.localId !== user.localId) throw forbidden();
      assertDraftEditable(order);
    }
    const returnLines = change(order.returnLines ?? [], ctx, order);
    const update = { returnLines, kind: orderKind({ lines: order.lines, returnLines }), updatedAt: new Date() };
    tx.update(ref, update);
    return { ...order, ...update };
  });
}

export const addReturnLine = (orderId, user, purchaseLine, input) =>
  changeReturnLines(orderId, user, (current, ctx) => [...current, buildReturnLine(purchaseLine, input, current, ctx)]);

export const updateReturnLine = (orderId, user, rlId, changes) =>
  changeReturnLines(orderId, user, (current, ctx) => {
    if (!current.some((l) => l.rlId === rlId)) throw new Error('Línea no encontrada');
    return current.map((l) => (l.rlId === rlId ? editReturnLine(l, changes, ctx) : l));
  });

export const removeReturnLine = (orderId, user, rlId) =>
  changeReturnLines(orderId, user, (current, _ctx, order) => {
    if (!current.some((l) => l.rlId === rlId)) throw new Error('Línea no encontrada');
    const next = current.filter((l) => l.rlId !== rlId);
    if (!next.length && !activeLines(order.lines).length) throw new Error('No se puede sacar la última línea: vaciá el carrito o anulá el pedido');
    return next;
  });

export async function searchAppPurchases({ doc = null, number = null }) {
  const col = getDb().collection(COLLECTION);
  const snap = number ? await col.where('number', '==', number).get() : await col.where('customer.docNumber', '==', doc).get();
  return snap.docs.map(withId)
    .filter((o) => o.status === 'confirmado' && activeLines(o.lines).length && o.odooOrders?.length)
    .sort((a, b) => toDate(b.createdAt) - toDate(a.createdAt)).slice(0, 30);
}

export const saveReturnSteps = (id, returnSteps) => patchOrder(id, { returnSteps });
export const saveAppliedCreditNotes = (id, appliedCreditNoteIds) => patchOrder(id, { appliedCreditNoteIds });
```

`removeLine`: cambiar la condición de "última línea" por:

```js
    const others = lines.some((l) => l.lineId !== lineId && l.status === 'activo');
    if (!others && !(order.returnLines ?? []).length) {
      throw new Error('No se puede sacar la última línea: vaciá el carrito o anulá el pedido');
    }
```

y como `removeLine` usa `changeLines(orderId, user, (lines) => …)`, cambiar `changeLines` para que pase el pedido como tercer argumento: `let lines = change(order.lines, ctx, order);` y la firma del callback de `removeLine` a `(lines, _ctx, order) => …`. En carrito, que quede sin líneas de venta está permitido solo si hay `returnLines` (el filtro `lines.filter((l) => l.status !== 'eliminado')` ya lo saca).

`submitCart`: después de validar el cliente, agregar `next.kind = orderKind({ lines: order.lines, returnLines: order.returnLines });` y si no hay ni líneas activas ni `returnLines`, tirar `'El pedido no tiene productos'`.

`updateDraft`: agregar

```js
    if (patch.refund !== undefined) update.refund = patch.refund === null ? null : {
      cashBack: Array.isArray(patch.refund.cashBack) ? patch.refund.cashBack.map(({ methodId, amount }) => ({ methodId: String(methodId), amount: Number(amount) })) : [],
      credit: Number(patch.refund.credit ?? 0),
    };
    if (patch.holderChangeReason !== undefined) update.holderChangeReason = String(patch.holderChangeReason).trim().slice(0, 200);
```

(la validación completa del reintegro va en el reclamo).

- [ ] **Step 7: Reclamo — reintegro, titular y consumo de saldo** (`claimOrderForConfirm`)

Antes de la transacción, cargar también locale y settings:

```js
  const [methodsById, promotions, locale, settings] = await Promise.all([
    getPaymentMethodsById(), listActivePromotions(), getLocale(user.localId), getSettings(),
  ]);
```

Dentro, reemplazar la línea `if (!activeLines(order.lines).length) errors.push('El pedido no tiene productos');` por:

```js
    const exchange = Boolean(order.returnLines?.length);
    if (!activeLines(order.lines).length && !exchange) errors.push('El pedido no tiene productos');
    if (exchange) {
      const ctx = returnCtx(locale, settings);
      for (const l of order.returnLines) errors.push(...validateReturnLine(l, ctx));
    }
```

(agregar `validateReturnLine` al import de `./posReturns.mjs`). Después de `claimPricing`:

```js
    let refund = null;
    let creditCommit = null;
    let creditAllocation = order.creditAllocation ?? null;
    if (exchange) {
      assertHolder(order);
      refund = validateRefund(order.refund, totals.net, methodsById);
    }
    const saldo = saldoAmount(payments, totals);
    if (saldo > 0 && !creditAllocation) {
      const consumed = await consumeCreditsInTx(tx, db, {
        docNumber: order.customer.docNumber, amount: saldo, orderId: order.id, orderNumber: order.number, user: user.name, nowMs: Date.now(),
      });
      creditAllocation = consumed.allocation;
      creditCommit = consumed.commit;
    }
    if (creditCommit) creditCommit();
    const update = {
      confirmingSince: new Date(), cashSessionId, payments, extraDiscount, totals, refund, creditAllocation,
      kind: orderKind(order), updatedAt: new Date(),
    };
```

(la lectura de saldos va después de `tx.get(pointer)` y antes de cualquier `tx.update`: se respeta "leer antes de escribir").

- [ ] **Step 8: Confirmado → alta del saldo; anulado → devolver el saldo usado**

En `markOrderConfirmed`, dentro de la transacción y antes de `tx.update(ref, update)`:

```js
    if (order.refund?.credit > 0) {
      const creditNoteIds = Object.values(order.returnSteps?.creditNotes ?? {}).map((n) => n.id).filter(Boolean);
      createCreditInTx(tx, db, order.id, buildCredit({
        order, amount: order.refund.credit, days: ctx.settings.creditValidityDays, nowMs: Date.now(), user, creditNoteIds,
      }));
    }
```

Como `markOrderConfirmed` recibe el `order` releído en la transacción, se usa el `returnSteps` ya guardado por los pasos de Odoo (Task 8).

En `markOrderAnnulled`, antes de `reserveInTx` (para leer antes de escribir):

```js
    const restore = order.creditAllocation?.length && order.status !== 'confirmado'
      ? await restoreCreditsInTx(tx, db, order.creditAllocation, { orderId: order.id, orderNumber: order.number, user })
      : null;
```

y después de `commit();`: `if (restore) restore();` y en `update` agregar `creditAllocation: null`.

- [ ] **Step 9: Correr todo**

Run: `cd Reportes/backend && npm test`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add posOrders.mjs posConfig.mjs test/posOrders.test.mjs
git commit -m "feat(pos): pedidos con lo que vuelve, reintegro y saldo a favor en el reclamo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Odoo — escrituras de devolución y nota de crédito

**Files:**
- Modify: `Reportes/backend/posReturnsOdoo.mjs` (agregar parte de escritura)
- Test: `Reportes/backend/test/posReturnsOdoo.test.mjs`

**Interfaces:**
- Consumes: `defaultOdoo`; `postInvoice` (feriaOdoo, publica una NC igual que una factura: diario + tipo de documento + `action_post`); `netOfIva`.
- Produces:
  - `allocateToMoves(qty, moves, returnedByMove) → [{ moveId, qty }]` (puro; tira si no alcanza)
  - `planCreditNoteCommands(ncLines, items) → Array` comandos x2many (puro)
  - `readMoves(moveIds, odoo?) → [{ id, product_id, quantity_done, product_uom, picking_id }]`
  - `createReturnPicking({ pickingId, items: [{ moveId, productId, uomId, qty }], locationId, pickingTypeId, origin }, odoo?) → pickingId`
  - `validatePicking(pickingId, lotsByProduct: Map<productId, [{ lotId, qty }]>, odoo?) → { id, name, state }`
  - `createManualReturn({ pickingTypeId, locationId, partnerId, items: [{ productId, qty }], origin }, odoo?) → pickingId` (crea y confirma; validar con `validatePicking`)
  - `createInternalTransfer({ pickingTypeId, fromLocationId, toLocationId, items: [{ productId, qty }], origin }, odoo?) → { id, name, state }`
  - `findPickingByOrigin(origin, odoo?) → { id, name, state } | null`
  - `latestLotFor(productId, odoo?) → lotId | null`
  - `createCreditNoteFromInvoice({ invoiceId, journalId, reason, items: [{ productId, qty }] }, odoo?) → creditNoteId` (borrador)
  - `createStandaloneCreditNote({ journalId, partnerId, reason, items: [{ productId, qty, unitValue }] }, odoo?) → creditNoteId` (borrador)
  - `findCreditNoteByRef(ref, odoo?) → { id, name, state } | null`
  - `applyCreditNote(invoiceId, creditNoteId, odoo?) → boolean`

- [ ] **Step 1: Tests que fallan** (agregar al final de `test/posReturnsOdoo.test.mjs`; sumar al import las funciones nuevas)

```js
import {
  allocateToMoves, planCreditNoteCommands, createReturnPicking, validatePicking, createCreditNoteFromInvoice, applyCreditNote,
} from '../posReturnsOdoo.mjs';

test('allocateToMoves: reparte entre los moves del remito descontando lo ya devuelto', () => {
  const moves = [{ id: 1, quantity_done: 2 }, { id: 2, quantity_done: 3 }];
  assert.deepEqual(allocateToMoves(3, moves, new Map([[1, 1]])), [{ moveId: 1, qty: 1 }, { moveId: 2, qty: 2 }]);
  assert.throws(() => allocateToMoves(5, moves, new Map([[1, 1]])), /ya se devolvió/);
});

test('planCreditNoteCommands: deja solo lo devuelto, con su cantidad; saca el resto (envío incluido)', () => {
  const ncLines = [
    { id: 11, product_id: [10, 'x'], quantity: 3 }, { id: 12, product_id: [10, 'x'], quantity: 2 },
    { id: 13, product_id: [4, 'envío'], quantity: 1 }, { id: 14, product_id: [11, 'y'], quantity: 1 },
  ];
  assert.deepEqual(planCreditNoteCommands(ncLines, [{ productId: 10, qty: 4 }, { productId: 11, qty: 1 }]), [
    [1, 11, { quantity: 3 }], [1, 12, { quantity: 1 }], [2, 13], [1, 14, { quantity: 1 }],
  ]);
  assert.throws(() => planCreditNoteCommands(ncLines, [{ productId: 99, qty: 1 }]), /no está en la factura/);
});

test('createReturnPicking: arma las líneas a mano, fija ubicación, tipo y origen', async () => {
  const { odoo, calls } = fakeOdoo({
    'stock.return.picking.create': () => [55],
    'stock.return.picking.create_returns': () => ({ res_id: 777 }),
    'stock.picking.write': () => true,
  });
  const id = await createReturnPicking({
    pickingId: 192311, items: [{ moveId: 612602, productId: 70417, uomId: 1, qty: 1 }], locationId: 324, pickingTypeId: 6, origin: 'LL-0042 · tpv:1',
  }, odoo);
  assert.equal(id, 777);
  const [, , [[vals]]] = calls.find((c) => c[1] === 'create');
  assert.equal(vals.picking_id, 192311);
  assert.equal(vals.location_id, 324);
  assert.deepEqual(vals.product_return_moves, [[0, 0, { product_id: 70417, move_id: 612602, uom_id: 1, quantity: 1, to_refund: true }]]);
  assert.ok(!('create_rma' in vals));
  const write = calls.find((c) => c[0] === 'stock.picking' && c[1] === 'write');
  assert.deepEqual(write[2], [[777], { picking_type_id: 6, origin: 'LL-0042 · tpv:1' }]);
});

test('validatePicking: con lote escribe el lote en la línea; sin lote, cantidad hecha; asistente = error', async () => {
  const { odoo, calls } = fakeOdoo({
    'stock.picking.read': () => [{ id: 777, name: 'LL/RET/1', state: 'assigned', move_ids: [1, 2] }],
    'stock.picking.action_assign': () => true,
    'stock.move.read': () => [
      { id: 1, product_id: [70417, 'x'], product_uom_qty: 1, move_line_ids: [] },
      { id: 2, product_id: [29175, 'y'], product_uom_qty: 2, move_line_ids: [31] },
    ],
    'stock.move.write': () => true,
    'stock.move.line.write': () => true,
    'stock.picking.button_validate': () => true,
  });
  await validatePicking(777, new Map([[29175, [{ lotId: 17050, qty: 2 }]]]), odoo);
  assert.ok(calls.some((c) => c[0] === 'stock.move' && c[1] === 'write' && JSON.stringify(c[2]) === '[[1],{"quantity_done":1}]'));
  assert.ok(calls.some((c) => c[0] === 'stock.move.line' && JSON.stringify(c[2]) === '[[31],{"lot_id":17050,"qty_done":2}]'));
});

test('createCreditNoteFromInvoice: reversión parcial en borrador en el diario del local', async () => {
  const { odoo, calls } = fakeOdoo({
    'account.move.reversal.create': () => [9],
    'account.move.reversal.reverse_moves': () => ({ res_id: 368705 }),
    'account.move.read': () => [{ id: 368705, invoice_line_ids: [1215806] }],
    'account.move.line.read': () => [{ id: 1215806, product_id: [68926, 'x'], quantity: 2 }],
    'account.move.write': () => true,
  });
  const id = await createCreditNoteFromInvoice({ invoiceId: 368292, journalId: 32, reason: 'LL-0042 devolución', items: [{ productId: 68926, qty: 1 }] }, odoo);
  assert.equal(id, 368705);
  const [, , [[vals]]] = calls.find((c) => c[0] === 'account.move.reversal' && c[1] === 'create');
  assert.deepEqual(vals, { move_ids: [[6, 0, [368292]]], refund_method: 'refund', journal_id: 32, reason: 'LL-0042 devolución', date_mode: 'entry' });
  assert.ok(!calls.some((c) => c[1] === 'action_post'));
  assert.deepEqual(calls.find((c) => c[0] === 'account.move' && c[1] === 'write')[2], [[368705], { invoice_line_ids: [[1, 1215806, { quantity: 1 }]] }]);
});

test('applyCreditNote: usa la línea a cobrar abierta de la NC', async () => {
  const { odoo, calls } = fakeOdoo({
    'account.move.line.search_read': () => [{ id: 5001 }],
    'account.move.js_assign_outstanding_line': () => true,
  });
  assert.equal(await applyCreditNote(400, 368705, odoo), true);
  assert.deepEqual(calls.at(-1).slice(0, 3), ['account.move', 'js_assign_outstanding_line', [[400], 5001]]);
  const empty = fakeOdoo({ 'account.move.line.search_read': () => [] });
  assert.equal(await applyCreditNote(400, 368705, empty.odoo), false);
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `cd Reportes/backend && node --test test/posReturnsOdoo.test.mjs`
Expected: FAIL (`allocateToMoves` no exportada).

- [ ] **Step 3: Implementar** (al final de `posReturnsOdoo.mjs`; agregar `import { netOfIva } from './posPricing.mjs';` arriba)

```js
// ---- Escritura ----

const VALIDATE_CTX = { skip_sms: true, skip_immediate: true, skip_backorder: true, lang: 'es_AR' };

export function allocateToMoves(qty, moves, returnedByMove) {
  const result = [];
  let left = qty;
  for (const m of moves) {
    if (left <= 0) break;
    const free = m.quantity_done - (returnedByMove.get(m.id) ?? 0);
    if (free <= 0) continue;
    const take = Math.min(free, left);
    result.push({ moveId: m.id, qty: take });
    left -= take;
  }
  if (left > 0) throw new Error(`Faltan ${left} unidades: ya se devolvió parte de esa compra`);
  return result;
}

export function planCreditNoteCommands(ncLines, items) {
  const left = new Map();
  for (const { productId, qty } of items) left.set(productId, (left.get(productId) ?? 0) + qty);
  const commands = ncLines.map((l) => {
    const want = left.get(id(l.product_id)) ?? 0;
    if (want <= 0) return [2, l.id];
    const take = Math.min(want, l.quantity);
    left.set(id(l.product_id), want - take);
    return [1, l.id, { quantity: take }];
  });
  const missing = [...left].filter(([, q]) => q > 0);
  if (missing.length) throw new Error(`El producto ${missing.map(([p]) => p).join(', ')} no está en la factura original (o con menos cantidad)`);
  return commands;
}

export function readMoves(moveIds, odoo = defaultOdoo) {
  return odoo.read('stock.move', 'read', [moveIds], { fields: ['id', 'product_id', 'quantity_done', 'product_uom', 'picking_id'] });
}

// v16: las líneas y la ubicación del asistente salen de un onchange, por eso
// se arman a mano (spike Fase 2). Nunca create_rma.
export async function createReturnPicking({ pickingId, items, locationId, pickingTypeId, origin }, odoo = defaultOdoo) {
  const context = { active_model: 'stock.picking', active_id: pickingId, active_ids: [pickingId] };
  const [wizardId] = await odoo.write('stock.return.picking', 'create', [[{
    picking_id: pickingId, location_id: locationId,
    product_return_moves: items.map((i) => [0, 0, { product_id: i.productId, move_id: i.moveId, uom_id: i.uomId, quantity: i.qty, to_refund: true }]),
  }]], { context });
  const action = await odoo.write('stock.return.picking', 'create_returns', [[wizardId]], { context });
  const returnId = action?.res_id;
  if (!returnId) throw new Error('Odoo no creó la devolución');
  await odoo.write('stock.picking', 'write', [[returnId], { ...(pickingTypeId ? { picking_type_id: pickingTypeId } : {}), origin }]);
  return returnId;
}

export async function validatePicking(pickingId, lotsByProduct = new Map(), odoo = defaultOdoo) {
  const [picking] = await odoo.read('stock.picking', 'read', [[pickingId]], { fields: ['id', 'name', 'state', 'move_ids'] });
  if (picking.state === 'done') return picking;
  if (picking.state === 'draft') await odoo.write('stock.picking', 'action_confirm', [[pickingId]]);
  await odoo.write('stock.picking', 'action_assign', [[pickingId]]);
  const moves = await odoo.read('stock.move', 'read', [picking.move_ids], { fields: ['id', 'product_id', 'product_uom_qty', 'move_line_ids'] });
  for (const m of moves) {
    const lots = lotsByProduct.get(id(m.product_id)) ?? [];
    if (!lots.length) {
      await odoo.write('stock.move', 'write', [[m.id], { quantity_done: m.product_uom_qty }]);
      continue;
    }
    // Lote(s) que salieron: la primera línea con el primer lote, el resto se crean.
    let left = m.product_uom_qty;
    for (const [i, lot] of lots.entries()) {
      if (left <= 0) break;
      const qty = Math.min(lot.qty, left);
      if (i === 0 && m.move_line_ids.length) await odoo.write('stock.move.line', 'write', [[m.move_line_ids[0]], { lot_id: lot.lotId, qty_done: qty }]);
      else await odoo.write('stock.move', 'write', [[m.id], { move_line_ids: [[0, 0, { lot_id: lot.lotId, qty_done: qty }]] }]);
      left -= qty;
    }
  }
  const res = await odoo.write('stock.picking', 'button_validate', [[pickingId]], { context: VALIDATE_CTX });
  if (res && typeof res === 'object' && res.res_model) throw new Error(`Odoo pidió confirmar algo al validar ${picking.name} (${res.res_model}): validalo en Odoo`);
  const [done] = await odoo.read('stock.picking', 'read', [[pickingId]], { fields: ['id', 'name', 'state'] });
  return done;
}

export async function createManualReturn({ pickingTypeId, locationId, partnerId, items, origin }, odoo = defaultOdoo) {
  const [pickingId] = await odoo.write('stock.picking', 'create', [[{
    picking_type_id: pickingTypeId, location_id: 5, location_dest_id: locationId, partner_id: partnerId, origin,
    move_ids_without_package: items.map((i) => [0, 0, { name: origin, product_id: i.productId, product_uom_qty: i.qty, location_id: 5, location_dest_id: locationId }]),
  }]]);
  await odoo.write('stock.picking', 'action_confirm', [[pickingId]]);
  return pickingId;
}

export async function createInternalTransfer({ pickingTypeId, fromLocationId, toLocationId, items, origin }, odoo = defaultOdoo) {
  const [pickingId] = await odoo.write('stock.picking', 'create', [[{
    picking_type_id: pickingTypeId, location_id: fromLocationId, location_dest_id: toLocationId, origin,
    move_ids_without_package: items.map((i) => [0, 0, { name: origin, product_id: i.productId, product_uom_qty: i.qty, location_id: fromLocationId, location_dest_id: toLocationId }]),
  }]]);
  await odoo.write('stock.picking', 'action_confirm', [[pickingId]]);
  await odoo.write('stock.picking', 'action_assign', [[pickingId]]);
  const [picking] = await odoo.read('stock.picking', 'read', [[pickingId]], { fields: ['id', 'name', 'state'] });
  return picking;
}

export async function findPickingByOrigin(origin, odoo = defaultOdoo) {
  const [found] = await odoo.read('stock.picking', 'search_read', [[['origin', '=', origin], ['state', '!=', 'cancel']]], { fields: ['id', 'name', 'state'], limit: 1 });
  return found ?? null;
}

export async function latestLotFor(productId, odoo = defaultOdoo) {
  const [lot] = await odoo.read('stock.lot', 'search_read', [[['product_id', '=', productId]]], { fields: ['id'], limit: 1, order: 'create_date desc' });
  return lot?.id ?? null;
}

// NC parcial: se revierte la factura original y, en borrador, se dejan solo
// las líneas y cantidades devueltas (spike Fase 2). Se publica aparte.
export async function createCreditNoteFromInvoice({ invoiceId, journalId, reason, items }, odoo = defaultOdoo) {
  const context = { active_model: 'account.move', active_ids: [invoiceId], active_id: invoiceId };
  const [wizardId] = await odoo.write('account.move.reversal', 'create', [[{
    move_ids: [[6, 0, [invoiceId]]], refund_method: 'refund', journal_id: journalId, reason, date_mode: 'entry',
  }]], { context });
  const action = await odoo.write('account.move.reversal', 'reverse_moves', [[wizardId]], { context });
  const creditNoteId = action?.res_id;
  if (!creditNoteId) throw new Error('Odoo no creó la nota de crédito');
  const [nc] = await odoo.read('account.move', 'read', [[creditNoteId]], { fields: ['id', 'invoice_line_ids'] });
  const lines = await odoo.read('account.move.line', 'read', [nc.invoice_line_ids], { fields: ['id', 'product_id', 'quantity'] });
  await odoo.write('account.move', 'write', [[creditNoteId], { invoice_line_ids: planCreditNoteCommands(lines, items) }]);
  return creditNoteId;
}

export async function createStandaloneCreditNote({ journalId, partnerId, reason, items }, odoo = defaultOdoo) {
  const [creditNoteId] = await odoo.write('account.move', 'create', [[{
    move_type: 'out_refund', journal_id: journalId, partner_id: partnerId, ref: reason,
    invoice_line_ids: items.map((i) => [0, 0, { product_id: i.productId, quantity: i.qty, price_unit: netOfIva(i.unitValue) }]),
  }]]);
  return creditNoteId;
}

export async function findCreditNoteByRef(ref, odoo = defaultOdoo) {
  const [found] = await odoo.read('account.move', 'search_read', [[
    ['move_type', '=', 'out_refund'], ['ref', 'ilike', ref], ['state', '!=', 'cancel'],
  ]], { fields: ['id', 'name', 'state'], limit: 1 });
  return found ?? null;
}

// Aplica (concilia) la NC a la factura nueva: Odoo concilia hasta lo menor
// entre lo abierto de la NC y lo abierto de la factura.
export async function applyCreditNote(invoiceId, creditNoteId, odoo = defaultOdoo) {
  const [line] = await odoo.read('account.move.line', 'search_read', [[
    ['move_id', '=', creditNoteId], ['account_id.account_type', '=', 'asset_receivable'], ['reconciled', '=', false],
  ]], { fields: ['id'], limit: 1 });
  if (!line) return false;
  await odoo.write('account.move', 'js_assign_outstanding_line', [[invoiceId], line.id]);
  return true;
}
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `cd Reportes/backend && node --test test/posReturnsOdoo.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add posReturnsOdoo.mjs test/posReturnsOdoo.test.mjs
git commit -m "feat(pos): devoluciones de remito, ingreso suelto, transferencia y NC en Odoo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Confirmar un cambio o devolución (reanudable)

**Files:**
- Create: `Reportes/backend/posReturnsConfirm.mjs`
- Modify: `Reportes/backend/posConfirm.mjs`
- Test: `Reportes/backend/test/posReturnsConfirm.test.mjs`

**Interfaces:**
- Consumes: Task 1 (`findDestination`), Task 2 (`invoiceGroups`, `activeLines`), Task 6 (`saveReturnSteps`, `saveAppliedCreditNotes`, `markOrderConfirmed`), Task 7 (todas las escrituras), `postInvoice` (feriaOdoo), `invoicingEnabledFor` (posConfirm), `withOrderLock` (feriaDelivery).
- Produces:
  - `returnStepKey(...)` claves estables: `pick:<source>:<purchaseId>:<pickingId>:<destinationId>`, `manual:<destinationId>`, `transfer:<destinationId>`, `nc:<invoiceId>`, `nc:manual`.
  - `planReturnSteps(order, movesById, destinationsById) → { pickings: [...], manuals: [...], transfers: [...] }` (puro)
  - `runReturnSteps(order, ctx, deps?) → returnSteps` (idempotente)
  - `applyCreditNotesStep(order, invoiceId, deps?) → string[]` (avisos)
  - `confirmReturnOrder(order, user, ctx, deps?) → order`
- `posConfirm.mjs`: `claimAndConfirmPos` usa `confirmReturnOrder` si hay `returnLines`; `paymentMethodIdFor` ignora "saldo"; `runPostConfirmSteps` aplica NC después de facturar; `annulPosOrder` no anula cambios/devoluciones.

`returnSteps` guardado en el pedido:

```js
{
  pickings: { [key]: { id, name, state } },     // devoluciones de remito e ingresos sueltos
  transfers: { [key]: { id, name, state } },    // traslados a otro depósito (quedan pendientes)
  creditNotes: { [key]: { id, name, state } },  // 'draft' | 'posted'
  creditNotesSkipped: boolean,                  // facturación apagada
}
```

- [ ] **Step 1: Tests que fallan** — `test/posReturnsConfirm.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planReturnSteps, runReturnSteps, confirmReturnOrder } from '../posReturnsConfirm.mjs';
import { DEFAULT_LOCALES, DEFAULT_SETTINGS } from '../posConfig.mjs';

const ctx = { locale: DEFAULT_LOCALES[0], locales: DEFAULT_LOCALES, settings: DEFAULT_SETTINGS, methodsById: new Map() };
const rl = (over = {}) => ({
  rlId: 'R1', source: 'tpv', purchaseId: '48870', purchaseLineId: '92250', productId: 70417, sku: 'BCC104TR', qty: 1, qtyBought: 1,
  unitValue: 4990, lots: [], moveIds: [612602], invoiceId: 368292, invoiceName: 'FA-B 1', destinationId: 'exhibicion', ...over,
});
const order = (over = {}) => ({
  id: 'o1', number: 'LL-0042', localId: 'LL', lines: [], returnLines: [rl()], returnSteps: {},
  customer: { docNumber: '30123456', name: 'Ana', odooPartnerId: 91779 }, refund: { cashBack: [], credit: 4990 }, ...over,
});

function fakeDeps(over = {}) {
  const calls = [];
  const rec = (name, result) => async (...args) => {
    calls.push([name, ...structuredClone(args)]);
    return typeof result === 'function' ? result(...args) : result;
  };
  let nextPicking = 777;
  let nextNc = 368705;
  const deps = {
    readMoves: rec('readMoves', (ids) => ids.map((mid) => ({ id: mid, product_id: [70417, 'x'], quantity_done: 1, product_uom: [1, 'u'], picking_id: [192311, 'LL/OUT/00260'] }))),
    returnedQtyByMove: rec('returned', new Map()),
    findPickingByOrigin: rec('findPicking', null),
    createReturnPicking: rec('createReturn', () => nextPicking++),
    createManualReturn: rec('createManual', () => nextPicking++),
    validatePicking: rec('validate', (pid) => ({ id: pid, name: `LL/RET/${pid}`, state: 'done' })),
    createInternalTransfer: rec('transfer', { id: 900, name: 'LL/INT/1', state: 'assigned' }),
    latestLotFor: rec('latestLot', null),
    findPartnerId: rec('partner', 91779),
    findCreditNoteByRef: rec('findNc', null),
    createCreditNoteFromInvoice: rec('createNc', () => nextNc++),
    createStandaloneCreditNote: rec('createNcManual', () => nextNc++),
    postCreditNote: rec('postNc', (ncId) => ({ id: ncId, name: `NC-B ${ncId}`, state: 'posted' })),
    saveReturnSteps: rec('saveSteps'),
    invoicingEnabled: () => true,
    ...over,
  };
  return { deps, calls };
}
const named = (calls, name) => calls.filter((c) => c[0] === name);

test('planReturnSteps: agrupa por remito original y destino; sin ticket por destino; traslados', () => {
  const o = order({ returnLines: [rl(), rl({ rlId: 'R2', source: 'manual', purchaseId: null, moveIds: [], destinationId: 'rolon' })] });
  const movesById = new Map([[612602, { id: 612602, product_id: [70417, 'x'], quantity_done: 1, product_uom: [1, 'u'], picking_id: [192311, 'x'] }]]);
  const plan = planReturnSteps(o, movesById, new Map(), ctx);
  assert.deepEqual(plan.pickings.map((p) => p.key), ['pick:tpv:48870:192311:exhibicion']);
  assert.deepEqual(plan.manuals.map((p) => [p.key, p.locationId]), [['manual:rolon', 8]]);
  assert.deepEqual(plan.transfers.map((t) => [t.key, t.fromLocationId, t.toLocationId]), [['transfer:rolon', 8, 174]]);
});

test('runReturnSteps: devolución de remito → validada → NC parcial publicada; guarda cada paso', async () => {
  const { deps, calls } = fakeDeps();
  const steps = await runReturnSteps(order(), ctx, deps);
  assert.equal(steps.pickings['pick:tpv:48870:192311:exhibicion'].state, 'done');
  assert.equal(steps.creditNotes['nc:368292'].state, 'posted');
  const create = named(calls, 'createReturn')[0][1];
  assert.equal(create.locationId, 324);
  assert.equal(create.pickingTypeId, 6);
  assert.equal(create.origin, 'LL-0042 · pick:tpv:48870:192311:exhibicion');
  assert.deepEqual(named(calls, 'createNc')[0][1].items, [{ productId: 70417, qty: 1 }]);
  assert.equal(named(calls, 'createNc')[0][1].journalId, 32);
  assert.ok(named(calls, 'saveSteps').length >= 3);
});

test('runReturnSteps: reintento después de una falla en la NC no crea otro remito', async () => {
  const previous = { pickings: { 'pick:tpv:48870:192311:exhibicion': { id: 777, name: 'LL/RET/777', state: 'done' } }, transfers: {}, creditNotes: {} };
  const { deps, calls } = fakeDeps();
  const steps = await runReturnSteps(order({ returnSteps: previous }), ctx, deps);
  assert.equal(named(calls, 'createReturn').length, 0);
  assert.equal(named(calls, 'validate').length, 0);
  assert.equal(steps.creditNotes['nc:368292'].state, 'posted');
});

test('runReturnSteps: NC creada pero sin publicar → solo se publica', async () => {
  const previous = {
    pickings: { 'pick:tpv:48870:192311:exhibicion': { id: 777, name: 'x', state: 'done' } }, transfers: {},
    creditNotes: { 'nc:368292': { id: 368705, name: '/', state: 'draft' } },
  };
  const { deps, calls } = fakeDeps();
  await runReturnSteps(order({ returnSteps: previous }), ctx, deps);
  assert.equal(named(calls, 'createNc').length, 0);
  assert.deepEqual(named(calls, 'postNc').map((c) => c[1]), [368705]);
});

test('runReturnSteps: la respuesta se perdió y el remito ya existe en Odoo → se adopta', async () => {
  const { deps, calls } = fakeDeps({ findPickingByOrigin: async () => ({ id: 555, name: 'LL/RET/555', state: 'assigned' }) });
  const steps = await runReturnSteps(order(), ctx, deps);
  assert.equal(named(calls, 'createReturn').length, 0);
  assert.equal(steps.pickings['pick:tpv:48870:192311:exhibicion'].id, 555);
});

test('runReturnSteps: si ya se devolvió en otra operación, frena antes de crear nada', async () => {
  const { deps, calls } = fakeDeps({ returnedQtyByMove: async () => new Map([[612602, 1]]) });
  await assert.rejects(runReturnSteps(order(), ctx, deps), /ya se devolvió/);
  assert.equal(named(calls, 'createReturn').length, 0);
});

test('runReturnSteps: con facturación apagada no crea NC y lo deja marcado', async () => {
  const { deps, calls } = fakeDeps({ invoicingEnabled: () => false });
  const steps = await runReturnSteps(order(), ctx, deps);
  assert.equal(named(calls, 'createNc').length, 0);
  assert.equal(steps.creditNotesSkipped, true);
});

test('runReturnSteps: sin ticket → ingreso suelto + NC suelta con precio de lista', async () => {
  const manual = rl({ source: 'manual', purchaseId: null, purchaseLineId: null, moveIds: [], invoiceId: null, destinationId: 'stock' });
  const { deps, calls } = fakeDeps();
  await runReturnSteps(order({ returnLines: [manual] }), ctx, deps);
  assert.equal(named(calls, 'createManual')[0][1].locationId, 8);
  assert.deepEqual(named(calls, 'createNcManual')[0][1].items, [{ productId: 70417, qty: 1, unitValue: 4990 }]);
});

test('confirmReturnOrder: devolución sola → pasos de Odoo y confirmada sin pedido nuevo', async () => {
  const { deps, calls } = fakeDeps({
    markOrderConfirmed: async (...args) => { calls.push(['markConfirmed', ...args]); },
    clearPostConfirmPending: async () => {},
    getOrder: async () => ({ id: 'o1', status: 'confirmado' }),
    confirmPosOrder: async () => { throw new Error('no debería'); },
  });
  const result = await confirmReturnOrder(order(), 'Caja LL', ctx, deps);
  assert.equal(result.status, 'confirmado');
  assert.deepEqual(named(calls, 'markConfirmed')[0][2], { odooOrders: [], user: 'Caja LL' });
});

test('confirmReturnOrder: cambio → después de los pasos sigue con el flujo de venta', async () => {
  const { deps, calls } = fakeDeps({
    confirmPosOrder: async (o) => { calls.push(['confirmPos', o.returnSteps]); return { id: 'o1', status: 'confirmado' }; },
  });
  const cambio = order({ lines: [{ lineId: 'L1', status: 'activo', qty: 1, basePrice: 9990, origin: 'stock', delivery: 'ahora' }] });
  await confirmReturnOrder(cambio, 'Caja LL', ctx, deps);
  assert.ok(named(calls, 'confirmPos')[0][1].creditNotes['nc:368292']);
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `cd Reportes/backend && node --test test/posReturnsConfirm.test.mjs`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `posReturnsConfirm.mjs`**

```js
// Confirmar lo que vuelve en Odoo (spec Fase 2 §6): devoluciones de remito o
// ingreso suelto → traslado a otro depósito si el destino lo pide → NC
// (parcial sobre la factura original, o suelta) → lo nuevo con el flujo de la
// Fase 1 → aplicación de la NC. Cada paso se guarda en returnSteps ANTES de
// seguir; un reintento sigue desde donde quedó y adopta lo que Odoo ya tiene
// (búsqueda por origen / referencia) en vez de duplicar.
import { returnDestinationsOf } from './posConfig.mjs';
import { activeLines } from './posLines.mjs';
import { invoiceGroups } from './posReturns.mjs';
import * as rOdoo from './posReturnsOdoo.mjs';
import * as orders from './posOrders.mjs';
import { postInvoice } from './feriaOdoo.mjs';
import { findOrCreatePosPartner } from './posOdoo.mjs';

const MANUAL_RETURN_SOURCE = 5; // Partners/Customers

export function defaultReturnDeps() {
  return {
    readMoves: rOdoo.readMoves, returnedQtyByMove: rOdoo.returnedQtyByMove, findPickingByOrigin: rOdoo.findPickingByOrigin,
    createReturnPicking: rOdoo.createReturnPicking, createManualReturn: rOdoo.createManualReturn, validatePicking: rOdoo.validatePicking,
    createInternalTransfer: rOdoo.createInternalTransfer, latestLotFor: rOdoo.latestLotFor,
    findPartnerId: (customer) => findOrCreatePosPartner(customer),
    findCreditNoteByRef: rOdoo.findCreditNoteByRef, createCreditNoteFromInvoice: rOdoo.createCreditNoteFromInvoice,
    createStandaloneCreditNote: rOdoo.createStandaloneCreditNote, postCreditNote: (ncId, journalId) => postInvoice(ncId, journalId),
    applyCreditNote: rOdoo.applyCreditNote, saveReturnSteps: orders.saveReturnSteps, saveAppliedCreditNotes: orders.saveAppliedCreditNotes,
    markOrderConfirmed: orders.markOrderConfirmed, clearPostConfirmPending: orders.clearPostConfirmPending, getOrder: orders.getOrder,
  };
}

const sumByProduct = (lines) => {
  const map = new Map();
  for (const l of lines) map.set(l.productId, (map.get(l.productId) ?? 0) + l.qty);
  return [...map].map(([productId, qty]) => ({ productId, qty }));
};

// Puro. `movesById`: moves de los remitos originales; `returnedByMove`: lo ya
// devuelto en Odoo por move (para repartir y para el tope).
export function planReturnSteps(order, movesById, returnedByMove, ctx) {
  const destinations = new Map(returnDestinationsOf(ctx.locale, ctx.settings).map((d) => [d.id, d]));
  const pickings = new Map();
  const manuals = new Map();
  for (const l of order.returnLines) {
    const dest = destinations.get(l.destinationId);
    if (!dest) throw new Error(`${l.sku}: el destino ya no existe, elegí otro`);
    if (l.source === 'manual') {
      const key = `manual:${dest.id}`;
      if (!manuals.has(key)) manuals.set(key, { key, locationId: dest.locationId, lines: [] });
      manuals.get(key).lines.push(l);
      continue;
    }
    const moves = l.moveIds.map((mid) => movesById.get(mid)).filter(Boolean);
    const parts = rOdoo.allocateToMoves(l.qty, moves, returnedByMove);
    for (const part of parts) {
      const move = movesById.get(part.moveId);
      const pickingId = move.picking_id[0];
      const key = `pick:${l.source}:${l.purchaseId}:${pickingId}:${dest.id}`;
      if (!pickings.has(key)) pickings.set(key, { key, pickingId, locationId: dest.locationId, items: [], lines: [] });
      const group = pickings.get(key);
      group.items.push({ moveId: part.moveId, productId: move.product_id[0], uomId: move.product_uom[0], qty: part.qty });
      group.lines.push({ ...l, qty: part.qty });
    }
  }
  const transfers = [...destinations.values()]
    .filter((d) => d.transferToLocationId && order.returnLines.some((l) => l.destinationId === d.id))
    .map((d) => ({
      key: `transfer:${d.id}`, fromLocationId: d.locationId, toLocationId: d.transferToLocationId,
      items: sumByProduct(order.returnLines.filter((l) => l.destinationId === d.id)),
    }));
  return { pickings: [...pickings.values()], manuals: [...manuals.values()], transfers };
}

const lotsMap = (lines) => {
  const map = new Map();
  for (const l of lines) if (l.lots?.length) map.set(l.productId, l.lots);
  return map;
};

export async function runReturnSteps(order, ctx, deps = defaultReturnDeps()) {
  const steps = {
    pickings: { ...(order.returnSteps?.pickings ?? {}) }, transfers: { ...(order.returnSteps?.transfers ?? {}) },
    creditNotes: { ...(order.returnSteps?.creditNotes ?? {}) }, creditNotesSkipped: false,
  };
  const save = () => deps.saveReturnSteps(order.id, structuredClone(steps));
  const origin = (key) => `${order.number} · ${key}`;

  // Tope: lo devuelto en Odoo SIN contar los remitos de esta operación.
  const moveIds = [...new Set(order.returnLines.flatMap((l) => l.moveIds ?? []))];
  const moves = moveIds.length ? await deps.readMoves(moveIds) : [];
  const movesById = new Map(moves.map((m) => [m.id, m]));
  const pendingPlan = Object.keys(steps.pickings).length === 0;
  const returnedByMove = moveIds.length && pendingPlan ? await deps.returnedQtyByMove(moveIds) : new Map();
  const plan = planReturnSteps(order, movesById, returnedByMove, ctx);

  // 1. Devoluciones de remito.
  for (const group of plan.pickings) {
    let step = steps.pickings[group.key];
    if (step?.state === 'done') continue;
    if (!step) {
      const found = await deps.findPickingByOrigin(origin(group.key));
      const pickingId = found?.id ?? await deps.createReturnPicking({
        pickingId: group.pickingId, items: group.items, locationId: group.locationId,
        pickingTypeId: ctx.locale.returnPickingTypeId, origin: origin(group.key),
      });
      step = { id: pickingId, name: found?.name ?? null, state: found?.state ?? 'draft' };
      steps.pickings[group.key] = step;
      await save();
    }
    steps.pickings[group.key] = await deps.validatePicking(step.id, lotsMap(group.lines));
    await save();
  }

  // 2. Ingresos sin ticket (lote: el más reciente del producto).
  for (const group of plan.manuals) {
    let step = steps.pickings[group.key];
    if (step?.state === 'done') continue;
    if (!step) {
      const found = await deps.findPickingByOrigin(origin(group.key));
      const partnerId = order.customer.odooPartnerId ?? await deps.findPartnerId(order.customer);
      const pickingId = found?.id ?? await deps.createManualReturn({
        pickingTypeId: ctx.locale.returnPickingTypeId, locationId: group.locationId, partnerId,
        items: sumByProduct(group.lines), origin: origin(group.key),
      });
      step = { id: pickingId, name: found?.name ?? null, state: found?.state ?? 'draft' };
      steps.pickings[group.key] = step;
      await save();
    }
    const lots = new Map();
    for (const l of group.lines) {
      const lotId = await deps.latestLotFor(l.productId);
      if (lotId) lots.set(l.productId, [{ lotId, qty: l.qty }]);
    }
    steps.pickings[group.key] = await deps.validatePicking(step.id, lots);
    await save();
  }

  // 3. Traslados a otro depósito: quedan pendientes para que logística los valide.
  for (const t of plan.transfers) {
    if (steps.transfers[t.key]) continue;
    const found = await deps.findPickingByOrigin(origin(t.key));
    steps.transfers[t.key] = found ?? await deps.createInternalTransfer({
      pickingTypeId: ctx.locale.internalPickingTypeId, fromLocationId: t.fromLocationId, toLocationId: t.toLocationId,
      items: t.items, origin: origin(t.key),
    });
    await save();
  }

  // 4. Notas de crédito (solo con la facturación del local habilitada).
  if (!deps.invoicingEnabled(ctx.locale)) {
    steps.creditNotesSkipped = true;
    await save();
    return steps;
  }
  const reason = `${order.number} devolución`;
  const ncGroups = invoiceGroups(order.returnLines).map((g) => ({ key: `nc:${g.invoiceId}`, invoiceId: g.invoiceId, lines: g.lines }));
  const manualLines = order.returnLines.filter((l) => l.source === 'manual');
  if (manualLines.length) ncGroups.push({ key: 'nc:manual', invoiceId: null, lines: manualLines });
  for (const g of ncGroups) {
    let step = steps.creditNotes[g.key];
    if (step?.state === 'posted') continue;
    if (!step) {
      const found = await deps.findCreditNoteByRef(`${reason} ${g.key}`);
      let ncId = found?.id;
      if (!ncId && g.invoiceId) {
        ncId = await deps.createCreditNoteFromInvoice({ invoiceId: g.invoiceId, journalId: ctx.locale.invoiceJournalId, reason: `${reason} ${g.key}`, items: sumByProduct(g.lines) });
      } else if (!ncId) {
        const partnerId = order.customer.odooPartnerId ?? await deps.findPartnerId(order.customer);
        ncId = await deps.createStandaloneCreditNote({
          journalId: ctx.locale.invoiceJournalId, partnerId, reason: `${reason} ${g.key}`,
          items: g.lines.map((l) => ({ productId: l.productId, qty: l.qty, unitValue: l.unitValue })),
        });
      }
      step = { id: ncId, name: found?.name ?? null, state: found?.state ?? 'draft' };
      steps.creditNotes[g.key] = step;
      await save();
    }
    steps.creditNotes[g.key] = await deps.postCreditNote(step.id, ctx.locale.invoiceJournalId);
    await save();
  }
  return steps;
}

// Después de facturar lo nuevo: aplica las NC de esta operación y las de los
// saldos usados. Nunca tira: devuelve avisos.
export async function applyCreditNotesStep(order, invoiceId, creditNoteIds, deps = defaultReturnDeps()) {
  const warnings = [];
  const applied = [...(order.appliedCreditNoteIds ?? [])];
  for (const ncId of creditNoteIds) {
    if (applied.includes(ncId)) continue;
    try {
      await deps.applyCreditNote(invoiceId, ncId);
      applied.push(ncId);
      await deps.saveAppliedCreditNotes(order.id, applied);
    } catch (err) {
      warnings.push(`No se pudo aplicar la nota de crédito ${ncId} a la factura (${err.message}): aplicala en Odoo`);
    }
  }
  return warnings;
}

export async function confirmReturnOrder(order, user, ctx, deps) {
  const returnSteps = await runReturnSteps(order, ctx, deps);
  const withSteps = { ...order, returnSteps };
  if (activeLines(order.lines).length) return deps.confirmPosOrder(withSteps, user, ctx);
  await deps.markOrderConfirmed(order.id, { odooOrders: [], user });
  await deps.clearPostConfirmPending(order.id);
  return deps.getOrder(order.id);
}
```

Nota sobre el tope en reintentos: si ya hay remitos de esta operación en `returnSteps`, lo devuelto en Odoo incluye lo de esta misma operación; por eso `returnedQtyByMove` solo se consulta cuando todavía no se creó ninguno (`pendingPlan`). En el reintento el plan se usa solo para las claves; los grupos ya `done` se saltean.

- [ ] **Step 4: Enganchar en `posConfirm.mjs`**

Imports:

```js
import { confirmReturnOrder, defaultReturnDeps, applyCreditNotesStep } from './posReturnsConfirm.mjs';
import { listCustomerCredits } from './posCredits.mjs';
```

En `defaultDeps()` agregar:

```js
    ...defaultReturnDeps(),
    invoicingEnabled: invoicingEnabledFor,
    creditNoteIdsOf: async (order) => {
      if (!order.creditAllocation?.length) return [];
      const credits = await listCustomerCredits(order.customer.docNumber);
      const used = new Set(order.creditAllocation.map((a) => a.creditId));
      return credits.filter((c) => used.has(c.id)).flatMap((c) => c.creditNoteIds ?? []);
    },
```

y `confirmPosOrder: (o, user, ctx) => confirmPosOrder(o, user, ctx, deps)` no puede referenciar `deps` dentro del literal: en `claimAndConfirmPos`, reemplazar

```js
    return await confirmPosOrder(order, user.name, await deps.loadCtx(order.localId), deps);
```

por

```js
    const ctx = await deps.loadCtx(order.localId);
    if (order.returnLines?.length) {
      return await confirmReturnOrder(order, user.name, ctx, { ...deps, confirmPosOrder: (o, u, c) => confirmPosOrder(o, u, c, deps) });
    }
    return await confirmPosOrder(order, user.name, ctx, deps);
```

`paymentMethodIdFor`: el medio de Odoo no puede ser "saldo":

```js
async function paymentMethodIdFor(order, ctx, deps) {
  const real = order.payments.filter((p) => p.methodId !== 'saldo');
  let odooPaymentName;
  if (real.length) {
    const principal = principalPayment(real, ctx.methodsById);
    odooPaymentName = resolveOdooPaymentName(ctx.methodsById.get(principal.methodId), principal.detailId);
  } else {
    odooPaymentName = ctx.settings.creditOdooPaymentName;
    if (!odooPaymentName) throw new Error('Configurá en Ajustes el medio de Odoo para ventas pagadas con saldo a favor');
  }
  const paymentMethodId = await deps.findPaymentMethodId(odooPaymentName);
  if (!paymentMethodId) throw new Error(`Medio de pago no encontrado en Odoo: "${odooPaymentName}"`);
  return paymentMethodId;
}
```

En `confirmPosOrder`, la condición `if (pending.length) { paymentMethodId = … }` queda igual (un cambio con neto ≤ 0 tiene `payments = []`): cambiar a `if (pending.length) { paymentMethodId = order.payments.length || ctx.settings.creditOdooPaymentName ? await paymentMethodIdFor(order, ctx, deps) : null; … }` y en `buildSaleOrderPayload` el `paymentMethodId` puede ser `null` (el payload de la feria lo omite si es falsy; verificar en `feriaOdoo.buildSaleOrderPayload` y, si no lo omite, borrar `payment_method_ids` del objeto `vals` cuando es null, igual que se hace con `pricelist_id`).

En `runPostConfirmSteps`, reemplazar el paso 6 por:

```js
  // 6. Factura (nunca tira) y 7. aplicación de NC de lo que vuelve / saldos usados.
  let invoiceId = order.invoiceId ?? null;
  if (order.wantsInvoice && !order.invoiceName && invoicingEnabledFor(ctx.locale)) {
    const result = await deps.invoice(order, ctx.locale);
    if (result?.status === 'invoiced') invoiceId = result.invoiceId;
  }
  if (invoiceId && deps.creditNoteIdsOf) {
    const own = Object.values(order.returnSteps?.creditNotes ?? {}).filter((n) => n.state === 'posted').map((n) => n.id);
    const ncWarnings = await applyCreditNotesStep(order, invoiceId, [...own, ...(await deps.creditNoteIdsOf(order))], deps);
    if (ncWarnings.length) await deps.setOrderWarning(order.id, [...warnings, ...ncWarnings].join(' · '));
  }
  await deps.clearPostConfirmPending(order.id);
```

Un cambio con NC necesita factura para aplicarla: en `claimOrderForConfirm` (Task 6) no se fuerza `wantsInvoice`; el panel de caja lo marca por defecto cuando la compra original tenía factura (Task 12).

`annulPosOrder`, después de leer el pedido:

```js
  if (order.returnLines?.length) throw new Error('Un cambio o devolución confirmado no se anula desde la app: resolvelo en Odoo');
```

- [ ] **Step 5: Correr todo**

Run: `cd Reportes/backend && npm test`
Expected: PASS (los nuevos y los de `posConfirm.test.mjs` sin cambios; si alguno de `posConfirm.test.mjs` arma `deps` sin `creditNoteIdsOf`, el `if (invoiceId && deps.creditNoteIdsOf)` lo saltea).

- [ ] **Step 6: Commit**

```bash
git add posReturnsConfirm.mjs posConfirm.mjs test/posReturnsConfirm.test.mjs
git commit -m "feat(pos): confirmar cambios y devoluciones en Odoo de forma reanudable

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Caja del día y estadísticas con reintegros y saldos

**Files:**
- Modify: `Reportes/backend/posCash.mjs`, `Reportes/backend/posStats.mjs`
- Test: `Reportes/backend/test/posCash.test.mjs`, `Reportes/backend/test/posStats.test.mjs`

**Interfaces:**
- Produces:
  - `paymentsOf(order)` → usa `collectOf(totals)`; sin pagos devuelve `[]`.
  - `computeCashSummary(...)` agrega `refundsByMethod`, `refundsTotal`, `creditsIssued`, `creditsUsed`, `returns`; `byMethod` y `total` NO incluyen "saldo"; `expectedCash` resta el reintegro en efectivo.
  - `computePosStats(...)`: `total` neto de devoluciones (`totals.net ?? totals.total`), productos devueltos restan, `byMethod` sin saldo y menos reintegros, agrega `returns`.

- [ ] **Step 1: Tests que fallan** (agregar al final de `test/posCash.test.mjs`)

```js
test('computeCashSummary: cambio cobra solo el neto; reintegro en efectivo resta; saldos aparte', () => {
  const orders = [
    order([{ methodId: 'efectivo', amount: null }], 30000, { kind: 'cambio', totals: { total: 30000, net: 8500, collect: 8500 } }),
    order([], 0, { kind: 'devolucion', totals: { total: 0, net: -5000, collect: 0 }, refund: { cashBack: [{ methodId: 'efectivo', amount: 2000 }, { methodId: 'transferencia', amount: 1000 }], credit: 2000 } }),
    order([{ methodId: 'saldo', amount: 3000 }, { methodId: 'credito', detailId: '6', amount: 7000 }], 10000),
  ];
  const s = computeCashSummary(orders, { openingCash: 10000, movements: [] });
  assert.deepEqual(s.byMethod, { efectivo: 8500, credito: 7000 });
  assert.deepEqual(s.refundsByMethod, { efectivo: 2000, transferencia: 1000 });
  assert.equal(s.refundsTotal, 3000);
  assert.equal(s.creditsIssued, 2000);
  assert.equal(s.creditsUsed, 3000);
  assert.equal(s.returns, 2);
  assert.equal(s.total, 15500);
  assert.equal(s.expectedCash, 16500); // 10.000 + 8.500 − 2.000
});

test('paymentsOf: devolución sin pagos no suma nada', () => {
  assert.deepEqual(paymentsOf({ payments: [], totals: { total: 0, collect: 0 } }), []);
});
```

y en `test/posStats.test.mjs` (con el `import { computePosStats } from '../posStats.mjs'` existente):

```js
test('computePosStats: las devoluciones restan del total y de los productos', () => {
  const at = new Date('2026-10-16T15:00:00-03:00');
  const orders = [
    { status: 'confirmado', confirmedAt: at, localId: 'LL', sellerId: 's', sellerName: 'V', payments: [{ methodId: 'efectivo', amount: null }], totals: { total: 10000, lineDiscountPct: 0 }, lines: [{ status: 'activo', sku: 'A', name: 'A', qty: 2, basePrice: 5000 }] },
    { status: 'confirmado', confirmedAt: at, localId: 'LL', sellerId: 's', sellerName: 'V', kind: 'devolucion', payments: [], totals: { total: 0, net: -5000, collect: 0, lineDiscountPct: 0 }, lines: [], returnLines: [{ sku: 'A', name: 'A', qty: 1, unitValue: 5000 }], refund: { cashBack: [{ methodId: 'efectivo', amount: 5000 }], credit: 0 } },
  ];
  const s = computePosStats(orders, {});
  assert.equal(s.total, 5000);
  assert.equal(s.sales, 1);
  assert.equal(s.returns, 1);
  assert.deepEqual(s.byMethod, { efectivo: 5000 });
  assert.deepEqual(s.topProducts.map((p) => [p.sku, p.qty, p.total]), [['A', 1, 5000]]);
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `cd Reportes/backend && node --test test/posCash.test.mjs test/posStats.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implementar en `posCash.mjs`**

```js
import { round2, collectOf } from './posPricing.mjs';
```

```js
export function paymentsOf(order) {
  const payments = order.payments ?? [];
  if (!payments.length) return [];
  if (payments.length === 1 || payments.every((p) => p.amount == null)) {
    return [{ methodId: payments[0].methodId, detailId: payments[0].detailId ?? null, amount: collectOf(order.totals) }];
  }
  return payments.map((p) => ({ methodId: p.methodId, detailId: p.detailId ?? null, amount: p.amount }));
}

export function computeCashSummary(orders, { openingCash, countedCash = null, movements = [] }) {
  const done = orders.filter((o) => o.status === 'confirmado');
  const byMethod = {};
  const byDetail = {};
  const refundsByMethod = {};
  let creditsUsed = 0;
  let creditsIssued = 0;
  for (const order of done) {
    for (const { methodId, detailId, amount } of paymentsOf(order)) {
      if (methodId === 'saldo') {
        creditsUsed = round2(creditsUsed + amount);
        continue;
      }
      byMethod[methodId] = round2((byMethod[methodId] ?? 0) + amount);
      if (detailId) byDetail[`${methodId}:${detailId}`] = round2((byDetail[`${methodId}:${detailId}`] ?? 0) + amount);
    }
    for (const { methodId, amount } of order.refund?.cashBack ?? []) refundsByMethod[methodId] = round2((refundsByMethod[methodId] ?? 0) + amount);
    creditsIssued = round2(creditsIssued + (order.refund?.credit ?? 0));
  }
  const active = movements.filter((m) => !m.voidedAt);
  const sumOf = (type, field = 'amount') => round2(active.filter((m) => m.type === type).reduce((s, m) => s + (m[field] ?? 0), 0));
  const expenses = sumOf('gasto');
  const withdrawals = sumOf('retiro');
  const usd = { amount: sumOf('ingreso_usd', 'usdAmount'), pesos: sumOf('ingreso_usd') };
  const total = round2(Object.values(byMethod).reduce((s, v) => s + v, 0));
  const refundsTotal = round2(Object.values(refundsByMethod).reduce((s, v) => s + v, 0));
  const expectedCash = round2(openingCash + (byMethod[CASH_METHOD_ID] ?? 0) - (refundsByMethod[CASH_METHOD_ID] ?? 0) - expenses - withdrawals);
  return {
    sales: done.filter((o) => (o.kind ?? 'venta') !== 'devolucion').length,
    returns: done.filter((o) => o.kind === 'devolucion' || o.kind === 'cambio').length,
    annulled: orders.filter((o) => o.status === 'anulado' && o.odooOrderId).length,
    byMethod, byDetail, total, refundsByMethod, refundsTotal, creditsIssued, creditsUsed,
    openingCash, expenses, withdrawals, usd, expectedCash,
    countedCash, difference: countedCash == null ? null : round2(countedCash - expectedCash),
  };
}
```

Verificar el test viejo `computeCashSummary: por medio y por detalle…`: `sales` sigue en 2 (las dos son ventas sin `kind`).

- [ ] **Step 4: Implementar en `posStats.mjs`**

Reemplazar el cuerpo del `for (const o of sold)` y el cálculo de `sales`:

```js
  for (const o of sold) {
    const t = o.totals?.net ?? o.totals?.total ?? 0;
    const isSale = (o.kind ?? 'venta') !== 'devolucion';
    total += t;
    bump(byLocal, o.localId, () => ({ localId: o.localId, sales: 0, total: 0 }), (r) => { r.sales += isSale ? 1 : 0; r.total = round2(r.total + t); });
    bump(bySeller, o.sellerId, () => ({ sellerId: o.sellerId, sellerName: o.sellerName, localId: o.localId, sales: 0, total: 0 }), (r) => { r.sales += isSale ? 1 : 0; r.total = round2(r.total + t); });
    for (const p of paymentsOf(o)) if (p.methodId !== 'saldo') byMethod[p.methodId] = round2((byMethod[p.methodId] ?? 0) + p.amount);
    for (const r of o.refund?.cashBack ?? []) byMethod[r.methodId] = round2((byMethod[r.methodId] ?? 0) - r.amount);
    const factor = 1 - (o.totals?.lineDiscountPct ?? 0) / 100;
    for (const l of (o.lines ?? []).filter((x) => x.status !== 'eliminado')) {
      bump(products, l.sku, () => ({ sku: l.sku, name: l.name, qty: 0, total: 0 }), (r) => {
        r.qty += l.qty;
        r.total = round2(r.total + l.qty * l.basePrice * factor);
      });
    }
    for (const rl of o.returnLines ?? []) {
      bump(products, rl.sku, () => ({ sku: rl.sku, name: rl.name, qty: 0, total: 0 }), (r) => {
        r.qty -= rl.qty;
        r.total = round2(r.total - rl.qty * rl.unitValue);
      });
    }
  }
  total = round2(total);
  const salesCount = sold.filter((o) => (o.kind ?? 'venta') !== 'devolucion').length;
```

y en el `return`: `sales: salesCount, returns: sold.filter((o) => o.kind === 'devolucion' || o.kind === 'cambio').length, … averageTicket: salesCount ? round2(total / salesCount) : 0,` y `topProducts: [...products.values()].filter((p) => p.qty > 0).sort(byTotal).slice(0, 20)`.

- [ ] **Step 5: Correr todo**

Run: `cd Reportes/backend && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add posCash.mjs posStats.mjs test/posCash.test.mjs test/posStats.test.mjs
git commit -m "feat(pos): reintegros y saldos en la caja del día y estadísticas netas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Servicio de compras y rutas `/api/pos`

**Files:**
- Create: `Reportes/backend/posReturnsService.mjs`
- Modify: `Reportes/backend/posRoutes.mjs`
- Test: `Reportes/backend/test/posReturnsService.test.mjs`

**Interfaces:**
- Consumes: Tasks 1–7.
- Produces (HTTP):
  - `GET /returns/search?q=` (sellers) → `{ purchases: PurchaseSummary[], errors: string[] }`. `q` con 7+ dígitos = DNI/CUIT; si no, número (`LL-0042`, `Alcorta/2301`, `Pedido 04468-…`, `TN2095…` o solo dígitos de Tiendanube).
  - `GET /returns/purchases/:source/:id` (sellers) → `Purchase`.
  - `GET /returns/manual-product/:productId` (sellers) → `PurchaseLine` sin ticket (precio de lista actual).
  - `POST /returns/carts` (sellers) `{ localId?, purchase: { source, purchaseId, purchaseLineId, productId }, returnLine: { qty, destinationId, reason, reasonNote } }` → pedido.
  - `POST /orders/:id/return-lines` (sellers; carrito propio o caja en su local) mismo body → pedido.
  - `PATCH /orders/:id/return-lines/:rlId` `{ qty?, destinationId?, reason?, reasonNote? }` → pedido.
  - `DELETE /orders/:id/return-lines/:rlId` → pedido.
  - `GET /credits?doc=` (sellers) → `{ balance, credits: [{ id, balance, expiresAt, localId, orderNumber }] }`.
  - `GET /admin/credits?doc=&expired=1` (admins) → `Credit[]`.
  - `POST /admin/credits/:id/extend` (admins) `{ expiresAt, reason }` → `Credit`.
  - `GET /config` agrega `returnReasons`, `creditMethod` y en cada local `returnDestinations: [{ id, label, default }]`.
- `posReturnsService.mjs`:
  - `classifyQuery(q) → { doc } | { ref }` (puro)
  - `searchPurchases(q, { sinceISO }, deps?) → { purchases, errors }`
  - `getPurchase(source, id, deps?) → Purchase`
  - `resolvePurchaseLine({ source, purchaseId, purchaseLineId, productId }, deps?) → PurchaseLine`

- [ ] **Step 1: Tests que fallan** — `test/posReturnsService.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyQuery, searchPurchases, resolvePurchaseLine } from '../posReturnsService.mjs';

test('classifyQuery: documento o referencia', () => {
  assert.deepEqual(classifyQuery('30.123.456'), { doc: '30123456' });
  assert.deepEqual(classifyQuery('20-12345678-9'), { doc: '20123456789' });
  assert.deepEqual(classifyQuery('LL-0042'), { ref: 'LL-0042' });
  assert.deepEqual(classifyQuery('Alcorta/2301'), { ref: 'Alcorta/2301' });
  assert.deepEqual(classifyQuery('TN2095995525'), { ref: 'TN2095995525' });
  assert.throws(() => classifyQuery('ab'), /Escribí el DNI\/CUIT o el número/);
});

test('searchPurchases: junta los tres orígenes; si uno falla, sigue con el resto', async () => {
  const deps = {
    searchApp: async () => [{ source: 'app', purchaseId: 'o1', label: 'LL-0042', date: '2026-10-10', partnerName: 'Ana', total: 100, invoiceName: null }],
    searchTpv: async () => { throw new Error('Odoo caído'); },
    searchWeb: async () => [{ source: 'web', purchaseId: '63677', label: 'TN1', date: '2026-10-12', partnerName: 'Ana', total: 50, invoiceName: null }],
  };
  const r = await searchPurchases('30123456', { sinceISO: '2025-10-16' }, deps);
  assert.deepEqual(r.purchases.map((p) => p.label), ['TN1', 'LL-0042']);
  assert.deepEqual(r.errors, ['TPV: Odoo caído']);
});

test('resolvePurchaseLine: toma la línea de la compra leída en el servidor', async () => {
  const deps = {
    getPurchase: async () => ({ lines: [{ purchaseLineId: '92250', sku: 'A', unitValue: 100 }] }),
    manualLine: async () => { throw new Error('no'); },
  };
  assert.equal((await resolvePurchaseLine({ source: 'tpv', purchaseId: '48870', purchaseLineId: '92250' }, deps)).unitValue, 100);
  await assert.rejects(resolvePurchaseLine({ source: 'tpv', purchaseId: '48870', purchaseLineId: '1' }, deps), /Esa línea no está en la compra/);
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `cd Reportes/backend && node --test test/posReturnsService.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implementar `posReturnsService.mjs`**

```js
// Compras para devolver: une la app (Firestore) con Odoo (TPV y Tiendanube).
// Las líneas que vuelven se arman SOLO con lo que devuelve este módulo.
import * as rOdoo from './posReturnsOdoo.mjs';
import { searchAppPurchases, getOrder } from './posOrders.mjs';
import { getSettings } from './posConfig.mjs';
import { getCatalogProducts } from './posCatalog.mjs';
import { appUnitValue } from './posReturns.mjs';

export function classifyQuery(q) {
  const text = String(q ?? '').trim();
  const digits = text.replace(/\D/g, '');
  if (/^[\d.\-\s]+$/.test(text) && digits.length >= 7 && digits.length <= 11) return { doc: digits };
  if (text.length >= 3) return { ref: text };
  throw new Error('Escribí el DNI/CUIT o el número de la compra');
}

const appSummary = (o) => ({
  source: 'app', purchaseId: o.id, label: o.number, date: (o.confirmedAt?.toDate?.() ?? new Date(o.confirmedAt)).toISOString(),
  partnerName: o.customer?.name ?? null, total: o.totals?.total ?? 0, invoiceName: o.invoiceName ?? null,
});

const defaultDeps = () => ({
  searchApp: async ({ doc, ref }) => {
    if (ref && !/^[A-Z]{2,4}-\d{4,}$/i.test(ref)) return [];
    return (await searchAppPurchases({ doc, number: ref?.toUpperCase() ?? null })).map(appSummary);
  },
  searchTpv: (q) => rOdoo.searchTpvPurchases(q),
  searchWeb: (q) => rOdoo.searchWebPurchases(q),
  getPurchase: (source, id) => getPurchase(source, id),
  manualLine: (productId) => manualLine(productId),
});

export async function searchPurchases(q, { sinceISO }, deps = defaultDeps()) {
  const query = { ...classifyQuery(q), sinceISO };
  const sources = [['Local', deps.searchApp], ['TPV', deps.searchTpv], ['Web', deps.searchWeb]];
  const results = await Promise.allSettled(sources.map(([, fn]) => fn(query)));
  const purchases = [];
  const errors = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') purchases.push(...r.value);
    else errors.push(`${sources[i][0]}: ${r.reason.message}`);
  });
  purchases.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return { purchases, errors };
}

export async function getPurchase(source, id) {
  if (source === 'tpv') return rOdoo.readTpvPurchase(id);
  if (source === 'web') {
    return rOdoo.readSaleOrderPurchase({
      source: 'web', purchaseId: String(id), label: null, saleOrderIds: [Number(id)],
      unitValueFor: (sl) => (sl.product_uom_qty > 0 ? Math.round((sl.price_total / sl.product_uom_qty) * 100) / 100 : 0),
    }).then((p) => ({ ...p, label: p.label ?? `Pedido web ${id}`, lines: p.lines.map((l) => ({ ...l, purchaseLabel: l.purchaseLabel ?? p.label })) }));
  }
  if (source === 'app') {
    const order = await getOrder(id);
    if (order.status !== 'confirmado') throw new Error('Esa venta no está confirmada');
    const byOdooLine = new Map(order.lines.filter((l) => l.odooLineId).map((l) => [l.odooLineId, l]));
    const purchase = await rOdoo.readSaleOrderPurchase({
      source: 'app', purchaseId: order.id, label: order.number, saleOrderIds: order.odooOrders.map((o) => o.odooOrderId),
      unitValueFor: (sl) => appUnitValue(byOdooLine.get(sl.id) ?? { basePrice: 0 }, order.totals?.lineDiscountPct),
    });
    // La app conoce el cliente y el número aunque Odoo tenga otro contacto de entrega.
    return { ...purchase, partnerVat: order.customer?.docNumber ?? purchase.partnerVat, partnerName: order.customer?.name ?? purchase.partnerName };
  }
  throw new Error('Origen de compra inválido');
}

export async function manualLine(productId) {
  const settings = await getSettings();
  const product = (await getCatalogProducts([Number(productId)], settings)).get(Number(productId));
  if (!product) throw new Error('Producto no encontrado en Odoo');
  return {
    source: 'manual', purchaseId: null, purchaseLabel: null, purchaseLineId: null, productId: product.productId, sku: product.sku,
    name: product.name, qtyBought: 0, qtyReturnedBefore: 0, unitValue: product.basePrice, lots: [], moveIds: [],
    invoiceId: null, invoiceName: null, partnerVat: null, partnerName: null,
  };
}

export async function resolvePurchaseLine({ source, purchaseId, purchaseLineId, productId }, deps = defaultDeps()) {
  if (source === 'manual') return deps.manualLine(productId);
  const purchase = await deps.getPurchase(source, purchaseId);
  const line = purchase.lines.find((l) => String(l.purchaseLineId) === String(purchaseLineId));
  if (!line) throw new Error('Esa línea no está en la compra (o ya no se puede devolver)');
  return line;
}
```

Nota: `validateReturnLine` no aplica el tope a `manual` (`qtyBought` = 0).

- [ ] **Step 4: Rutas en `posRoutes.mjs`**

Imports:

```js
import { returnDestinationsOf } from './posConfig.mjs';
import { searchPurchases, getPurchase, resolvePurchaseLine, manualLine } from './posReturnsService.mjs';
import { customerBalance, listCreditsForAdmin, extendCredit, SALDO_METHOD } from './posCredits.mjs';
```

`publicLocale` necesita los ajustes para los destinos; cambiarla a:

```js
export function publicLocale(locale, settings) {
  return {
    id: locale.id, name: locale.name, address: locale.address, invoices: invoicingEnabledFor(locale),
    returnDestinations: returnDestinationsOf(locale, settings).map(({ id, label, default: isDefault }) => ({ id, label, default: isDefault })),
  };
}
```

y en `/config`: `locales: locales.filter((l) => l.active !== false).map((l) => publicLocale(l, settings)),`, `creditMethod: SALDO_METHOD,` y en `settings` agregar `returnReasons: settings.returnReasons`. Revisar `test/posRoutes.test.mjs`: si testea `publicLocale(locale)`, pasarle `DEFAULT_SETTINGS` como segundo argumento y agregar `returnDestinations` al objeto esperado (es el único test existente que cambia).

Agregar después de "Líneas (carrito propio o pedido en caja)":

```js
// ---- Cambios y devoluciones ----
const sinceISO = (settings) => new Date(Date.now() - settings.returnSearchDays * 864e5).toISOString().slice(0, 10);

router.get('/returns/search', ...sellers, handle(async (req) => searchPurchases(req.query.q, { sinceISO: sinceISO(await getSettings()) })));

router.get('/returns/purchases/:source/:id', ...sellers, handle((req) => getPurchase(req.params.source, req.params.id)));

router.get('/returns/manual-product/:productId', ...sellers, handle((req) => manualLine(req.params.productId)));

router.post('/returns/carts', ...sellers, handle(async (req) => {
  let localId = req.posUser.localId;
  if (isAdminRole(req.posUser.role)) {
    localId = req.body?.localId;
    if (!(await getLocales()).some((l) => l.id === localId)) throw new Error('Elegí un local válido');
  }
  const purchaseLine = await resolvePurchaseLine(req.body?.purchase ?? {});
  return orders.createReturnCart(actingUser(req, localId), purchaseLine, req.body?.returnLine ?? {});
}));

router.post('/orders/:id/return-lines', ...sellers, handle(async (req) => {
  const order = await orderFor(req);
  assertLineEditAccess(order, req.posUser);
  const purchaseLine = await resolvePurchaseLine(req.body?.purchase ?? {});
  return orders.addReturnLine(req.params.id, actingUser(req, order.localId), purchaseLine, req.body?.returnLine ?? {});
}));

router.patch('/orders/:id/return-lines/:rlId', ...sellers, handle(async (req) => {
  const order = await orderFor(req);
  assertLineEditAccess(order, req.posUser);
  return orders.updateReturnLine(req.params.id, actingUser(req, order.localId), req.params.rlId, req.body ?? {});
}));

router.delete('/orders/:id/return-lines/:rlId', ...sellers, handle(async (req) => {
  const order = await orderFor(req);
  assertLineEditAccess(order, req.posUser);
  return orders.removeReturnLine(req.params.id, actingUser(req, order.localId), req.params.rlId);
}));

// ---- Saldo a favor ----
router.get('/credits', ...sellers, handle(async (req) => {
  const doc = String(req.query.doc ?? '').replace(/\D/g, '');
  if (doc.length < 7) throw new Error('Escribí el DNI o CUIT completo');
  const { balance, credits } = await customerBalance(doc);
  return { balance, credits: credits.map(({ id, balance: b, expiresAt, localId, orderNumber }) => ({ id, balance: b, expiresAt, localId, orderNumber })) };
}));
```

En la sección Admin:

```js
router.get('/admin/credits', ...admins, handle((req) => listCreditsForAdmin({
  docNumber: req.query.doc ? String(req.query.doc).replace(/\D/g, '') : null, expiredOnly: req.query.expired === '1',
})));
router.post('/admin/credits/:id/extend', ...admins, validId(CONFIG_ID, 'Id de saldo'), handle((req) => extendCredit(req.params.id, req.body ?? {}, req.posUser.name)));
```

(`CONFIG_ID` acepta ids de Firestore de 20 caracteres alfanuméricos.)

- [ ] **Step 5: Correr todo**

Run: `cd Reportes/backend && npm test`
Expected: PASS.

- [ ] **Step 6: Prueba de humo local (solo lectura)**

Run: `cd Reportes/backend && npm run dev` (en otra terminal). Con un token de caja de prueba, `GET /api/pos/returns/search?q=Alcorta/2301` y `GET /api/pos/returns/purchases/tpv/48870`.
Expected: el ticket aparece con su línea, `unitValue` 52990 y `invoiceName` `FA-B 00012-00001533`. (Solo lecturas en Odoo.)

- [ ] **Step 7: Commit**

```bash
git add posReturnsService.mjs posRoutes.mjs test/posReturnsService.test.mjs test/posRoutes.test.mjs
git commit -m "feat(pos): rutas de cambios, devoluciones y saldo a favor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Front — piezas compartidas (buscar compra, lo que vuelve, saldo)

**Files:**
- Create: `client/src/lib/returns.js`, `client/src/components/ReturnPicker.jsx`, `client/src/components/ReturnPicker.module.css`, `client/src/components/ReturnLines.jsx`, `client/src/components/CreditBadge.jsx`

**Interfaces (API usada):** `GET /returns/search?q=`, `GET /returns/purchases/:source/:id`, `GET /returns/manual-product/:productId`, `GET /products/search?q=` (para "Sin ticket"), `GET /credits?doc=`.
- Props:
  - `<ReturnPicker config localId busy onPick={(purchase, purchaseLine, values) => …} onClose />` — `values = { qty, destinationId, reason, reasonNote }`; `purchase = { source, purchaseId, purchaseLineId, productId }`.
  - `<ReturnLines lines destinations busy onEdit={(rl, changes) => …} onRemove={(rl) => …} />`
  - `<CreditBadge doc />` — busca el saldo cuando `doc` tiene 7+ dígitos; muestra nada si es 0.

Comportamiento:
1. `ReturnPicker` paso 1: un campo "DNI/CUIT o número de compra" + "Buscar" (no busca con menos de 3 caracteres) y un botón "Sin ticket". Resultados en lista: etiqueta de origen (`Local` / `TPV` / `Web`) como texto, número, fecha (`dd/mm/aaaa`), cliente, total y factura si tiene. Si la respuesta trae `errors`, se muestran como aviso informativo arriba de la lista ("No se pudo buscar en TPV: …") sin bloquear. Descarta respuestas viejas (contador de búsqueda, como en `ProductSearch`).
2. Paso 2 (al tocar una compra): líneas con nombre, SKU, "Compró N · devolvió M", valor unitario a reintegrar y botón "Devolver". Las líneas con `maxReturnable = 0` se ven deshabilitadas con "Ya se devolvió todo". Si `purchase.pending` tiene algo: aviso "Todavía no se entregó: … — eso se anula, no se devuelve".
3. "Devolver" abre una hoja con: cantidad (− / +, tope `qtyBought − qtyReturnedBefore`), **destino** (select con `locale.returnDestinations`, el `default` preseleccionado), **motivo** (botones con `config.settings.returnReasons`; con "Otro" aparece un campo de texto obligatorio) y el valor total de la línea. Confirmar → `onPick`.
4. "Sin ticket": buscador de productos (`ProductSearch` existente) → al elegir, `GET /returns/manual-product/:productId` → misma hoja (sin tope de cantidad, con la leyenda "Valor: precio de lista actual").
5. `ReturnLines`: cada línea con nombre, cantidad (− / +), destino (select), motivo (texto) y "Quitar"; valor total en negativo (`− $ 52.990`). Etiqueta del origen y número de compra en gris.
6. `CreditBadge`: chip "Tiene $ 12.000 a favor (vence 12/01)" (si no vence: "sin vencimiento"); si hay varios, el vencimiento del primero.

- [ ] **Step 1: `lib/returns.js`**

```js
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
```

- [ ] **Step 2: `CreditBadge.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { formatMoney } from '../lib/labels.js';

export default function CreditBadge({ doc }) {
  const [credit, setCredit] = useState(null);
  const digits = String(doc ?? '').replace(/\D/g, '');
  useEffect(() => {
    let alive = true;
    setCredit(null);
    if (digits.length < 7) return undefined;
    api(`/credits?doc=${digits}`).then((r) => alive && setCredit(r)).catch(() => {});
    return () => { alive = false; };
  }, [digits]);
  if (!credit?.balance) return null;
  const first = credit.credits[0];
  const due = first?.expiresAt ? `vence ${new Date(first.expiresAt._seconds ? first.expiresAt._seconds * 1000 : first.expiresAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}` : 'sin vencimiento';
  return <span className="chip chip-ok">Tiene {formatMoney(credit.balance)} a favor ({due})</span>;
}
```

(Si `chip`/`chip-ok` no existen en `styles/global.css`, usar las clases de chip que ya usa el chip "Decorador/Arquitecto" de `CustomerForm.jsx`.)

- [ ] **Step 3: `ReturnPicker.jsx` + `.module.css` y `ReturnLines.jsx`** con el comportamiento de arriba. Reusar `Notice`, `EmptyState` de `components/ui.jsx`, `ProductSearch` y `formatMoney`. La hoja de "Devolver" sigue el patrón de `LineSheet` del `VendedorPanel` (hoja inferior en celular, diálogo en escritorio: el componente recibe `variant="sheet" | "dialog"`). Objetivos táctiles ≥ 44 px y campos ≥ 16 px (PRODUCT.md).

- [ ] **Step 4: Build**

Run: `cd punto-venta-altorancho/client && npm run build`
Expected: build sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/lib/returns.js src/components/ReturnPicker.jsx src/components/ReturnPicker.module.css src/components/ReturnLines.jsx src/components/CreditBadge.jsx
git commit -m "feat(front): buscar compra, lo que vuelve y saldo a favor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Front — Vendedor y Caja

**Files:**
- Modify: `client/src/pages/VendedorPanel.jsx` (+ `.module.css`), `client/src/pages/caja/NewOrderView.jsx`, `OrderDetail.jsx`, `PaymentBox.jsx`, `QueueView.jsx`, `HistoryView.jsx`, `CajaPanel.jsx`
- Create: `client/src/pages/caja/RefundBox.jsx`

**Interfaces (API usada):** las de Task 11 + `POST /returns/carts`, `POST|PATCH|DELETE /orders/:id/return-lines…`, `PATCH /orders/:id { refund, holderChangeReason, wantsInvoice }`, `GET /orders/:id` (el `preview.totals` trae `net`, `collect`, `returnValue` en cambios).

Comportamiento — Vendedor:
1. Junto a "Nuevo cliente", botón **"Cambio / devolución"**: abre `ReturnPicker` (variante hoja). Al elegir la primera línea: `POST /returns/carts` (sin carrito activo) o `POST /orders/:id/return-lines`. El carrito pasa a mostrar arriba el bloque **"Vuelve"** (`ReturnLines`) y debajo **"Se lleva"** (el carrito de siempre, opcional).
2. Con lo que vuelve cargado, el cliente se precarga con el `partnerVat` de la compra (dispara la búsqueda de `CustomerForm`); si el vendedor lo cambia por otro documento, aparece el campo obligatorio "Motivo del cambio de titular" (se manda en el submit como parte del pedido vía `PATCH` por caja; en el vendedor se guarda en `notes` con el prefijo "Titular: …" — la caja lo pasa a `holderChangeReason`).
3. Barra fija: con lo que vuelve muestra el neto aproximado (`roughNet`): "Paga $ X" o "A favor del cliente $ X" (aclaración chica: "caja aplica los descuentos"). Botón "Enviar a caja" igual que siempre.
4. `CreditBadge` debajo del documento del cliente (en venta y en cambio).

Comportamiento — Caja:
5. `CajaPanel`: el ítem "Nuevo pedido" pasa a llamarse **"Nueva operación"**. En `NewOrderView`, además del buscador de productos, un botón "Agregar lo que vuelve" (abre `ReturnPicker` en diálogo) con el mismo flujo del vendedor.
6. `QueueView` y `HistoryView`: etiqueta de tipo (`KIND_LABELS[order.kind ?? 'venta']`) junto al número; `HistoryView` agrega filtro "Tipo" (Todas / Ventas / Cambios / Devoluciones) en código.
7. `OrderDetail`: si hay `returnLines`, bloque **"Vuelve"** (editable mientras está en caja: `ReturnLines`) arriba de **"Se lleva"**; resumen con "Vuelve − $ R", "Se lleva $ T", **neto**.
   - `preview.totals.collect > 0`: `PaymentBox` de siempre cobrando `collect` (no `total`).
   - `preview.totals.net < 0`: `RefundBox` en lugar de `PaymentBox`.
   - Si la compra original tenía factura y hay algo nuevo, `wantsInvoice` arranca marcado (para poder aplicar la NC), con la leyenda "Hace falta factura para aplicar la nota de crédito".
   - Si `customer.docNumber` difiere del `partnerVat` de alguna línea: campo obligatorio "Motivo del cambio de titular" → `PATCH { holderChangeReason }` (precargado desde `notes` si viene "Titular: …").
8. `RefundBox` (props: `amount` = −net, `methods` = medios activos sin "saldo", `value`, `onSave(refund)`): por defecto todo como **saldo a favor**; botones "Todo saldo a favor" / "Todo reintegro" y modo dividido (filas medio + monto, más "Saldo a favor $ …" con "Completar con saldo"). Los montos usan `parseMoney` (formato argentino). Muestra "Suma $ X de $ Y" y deshabilita guardar si no suma exacto. Guarda con `PATCH /orders/:id { refund: { cashBack, credit } }`.
9. `PaymentBox`: si el cliente tiene saldo (`GET /credits?doc=`), agrega el medio **"Saldo a favor (disponible $ X)"** usando `config.creditMethod`; en pago dividido, "Completar con saldo" hasta el disponible. Leyenda: "Pagar con saldo no suma descuento de efectivo".
10. Después de confirmar un cambio/devolución, el detalle muestra un comprobante: número, tipo, lo que volvió (con destino), lo nuevo, reintegros por medio, saldo generado y saldo restante del cliente (`CreditBadge`), y los documentos de Odoo de `order.returnSteps` (remitos, traslados pendientes "Pendiente de retirar por logística", NC) y del pedido nuevo. Si `returnSteps.creditNotesSkipped`: aviso "Nota de crédito pendiente: la facturación de este local está apagada".

- [ ] **Step 1: `RefundBox.jsx`** con el comportamiento 8 (reusar `parseMoney`/`moneyText` de `caja/money.js`, `formatMoney`, y el estilo de filas de `PaymentBox`).
- [ ] **Step 2: Vendedor** (comportamientos 1–4).
- [ ] **Step 3: Caja** (comportamientos 5–7, 9, 10).
- [ ] **Step 4: Build**

Run: `cd punto-venta-altorancho/client && npm run build`
Expected: build sin errores.

- [ ] **Step 5: Prueba manual contra el backend local** (skill `run`: `cd Reportes/backend && npm run dev` y `cd punto-venta-altorancho/client && npm run dev` con `VITE_API_URL=http://localhost:3000`). Solo hasta **antes de confirmar** (confirmar escribe en Odoo; eso es la Task 15):
  - Vendedor: "Cambio / devolución" → buscar `Alcorta/2301` → aparece el ticket → devolver 1 a "Exhibición" con motivo "Talle o medida" → agregar un producto nuevo → la barra muestra el neto → "Enviar a caja".
  - Caja: el pedido aparece con etiqueta "Cambio"; el detalle muestra "Vuelve" y "Se lleva"; con neto negativo aparece `RefundBox` y no deja guardar si no suma; con neto positivo el `PaymentBox` cobra solo el neto.
  - "Sin ticket": buscar un producto, la hoja dice "precio de lista actual".
  - Después, anular desde caja el pedido de prueba (no está en Odoo: `POST /orders/:id/annul`).

- [ ] **Step 6: Commit**

```bash
git add src/pages
git commit -m "feat(front): cambios y devoluciones en vendedor y caja

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Front — Caja del día y Admin

**Files:**
- Modify: `client/src/pages/caja/CashDayView.jsx`, `client/src/pages/admin/LocalesView.jsx`, `SettingsView.jsx`, `AdminPanel.jsx`, `AdminHistoryView.jsx`, `AdminStatsView.jsx`
- Create: `client/src/pages/admin/CreditsView.jsx`

**Interfaces (API usada):** `GET /cash/current` (summary nuevo de Task 9), `GET|PUT /admin/locales`, `GET /admin/options`, `GET|PUT /admin/settings`, `GET /admin/credits`, `POST /admin/credits/:id/extend`, `GET /admin/stats`.

Comportamiento:
1. `CashDayView` → `Summary`: debajo de "Por medio de pago", filas **"Reintegros"** por medio (en negativo) y total; **"Saldos emitidos"** y **"Saldos usados"** (sin mover plata, en gris, con la leyenda "no es plata"); "Devoluciones y cambios: N". El efectivo esperado ya viene restado del backend.
2. `LocalesView`: en la edición de un local, sección **"Destinos de devolución"**: tabla editable (nombre, ubicación de Odoo — select con las ubicaciones internas de `/admin/options`, "Mandar después a" — select opcional, por defecto — radio, activo — check), "Agregar destino" y "Cargar los de siempre" (stock / exhibición / enviar a Rolón). Campos "Tipo de remito de devolución" y "Tipo de transferencia interna" (inputs numéricos con el id de Odoo). Los errores del backend se muestran tal cual. Si `/admin/options` no trae ubicaciones, agregar en `listOdooOptions` (posOdoo) `locations: stock.location internas [id, complete_name]` en esta misma tarea (es una lectura).
3. `SettingsView`: "Días de validez del saldo a favor" (vacío = no vence), "Motivos de devolución" (lista editable, uno por línea), "Días hacia atrás para buscar compras", "Medio de Odoo si se paga todo con saldo" (texto, el nombre exacto del `payment.method`).
4. `CreditsView` (nuevo ítem del menú Admin **"Saldos a favor"**): buscador por DNI/CUIT y botón "Ver vencidos"; tabla con cliente, documento, local y número de origen, monto, disponible, vence, estado; al abrir uno: movimientos (alta / uso / devuelto / extensión, con quién y cuándo) y "Extender vencimiento" (fecha + motivo obligatorio) → `POST /admin/credits/:id/extend`.
5. `AdminHistoryView`: etiqueta y filtro por tipo, igual que caja. `AdminStatsView`: tarjeta "Devoluciones y cambios" con `stats.returns`; el total ya viene neto.

- [ ] **Step 1: Caja del día** (1).
- [ ] **Step 2: Locales, Ajustes, Historial y Estadísticas** (2, 3, 5).
- [ ] **Step 3: Saldos a favor** (4) y su ítem en `AdminPanel`.
- [ ] **Step 4: Build y tests backend** (si se tocó `listOdooOptions`)

Run: `cd punto-venta-altorancho/client && npm run build` y `cd Reportes/backend && npm test`
Expected: build sin errores; tests PASS.

- [ ] **Step 5: Prueba manual local** (sin Odoo): editar destinos de LL (agregar "Fallas" apuntando a `RMA/Fall` 392 como prueba, guardar, ver que aparece en el `ReturnPicker`, volver a dejarlo como estaba), ajustes de saldo, y la pantalla de saldos vacía.

- [ ] **Step 6: Commit**

```bash
git add src/pages
git commit -m "feat(front): caja del día con reintegros y saldos; admin de destinos, ajustes y saldos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Revisión de pendientes con terceros

**Files:**
- Modify: `punto-venta-altorancho/docs/superpowers/spikes/2026-10-fase2-odoo-spikes.md`

No es código: dejar asentado qué falta de Odoo/dueño antes de la punta a punta, para que la Task 15 no se trabe.

- [ ] **Step 1: Corregir el spike** — en "Otros hallazgos", los tipos "Devoluciones" de BL (308) y AL (352) **existen**; lo que falta es que el remito TPV los tenga como tipo de devolución. La app igual fija `returnPickingTypeId` por local (Task 1), así que no bloquea.

- [ ] **Step 2: Lista de pendientes** (sección nueva al final del spike):

```markdown
## Pendientes antes de la punta a punta (Fase 2)

| # | Qué | Quién | Bloquea |
|---|---|---|---|
| 1 | Grupo "RMA / Usuario" para el usuario de la API (uid 2798) | Admin de Odoo | Ingreso sin ticket y traslado a Rolón |
| 2 | Ubicaciones de fallas por local (o usar `RMA/Fall`) y cargarlas en Admin → Locales | Dueño + admin de Odoo | Destino "Fallas" |
| 3 | Medio de Odoo para ventas pagadas 100 % con saldo (Ajustes) | Dueño | Ventas pagadas solo con saldo |
| 4 | Días de validez del saldo a favor (Ajustes) | Dueño | Nada (vacío = no vence) |
| 5 | Qué se hace con los saldos de "Cuenta de cliente" del POS nativo | Dueño | Nada (decisión pendiente) |
| 6 | Autorización para facturar (NC reales) | Dueño | NC y su aplicación |
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/spikes/2026-10-fase2-odoo-spikes.md
git commit -m "docs: pendientes con terceros para la Fase 2

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Prueba de punta a punta en Odoo y despliegue

**Files:**
- Create: `punto-venta-altorancho/docs/superpowers/spikes/2026-10-fase2-e2e.md`

**Requiere autorización explícita del dueño en el momento** (escribe en el Odoo real). Reiniciar el backend antes de empezar.

- [ ] **Step 1: Preparar** — backend local en la rama `feature/pos-fase2`, usuarios de prueba vendedor/caja de LL (como en `2026-10-e2e.md`), caja LL abierta, cliente "PRUEBA POS" (partner 91779). Facturación **apagada** salvo que el dueño autorice lo contrario.

- [ ] **Step 2: Escenarios** (anotar en la tabla del doc: interno, documentos de Odoo, resultado):

| # | Escenario | Esperado |
|---|---|---|
| 1 | Venta de la app (crear una nueva con "se lo lleva ahora") → devolución de 1 u. a Exhibición con reintegro en efectivo | `LL/RET/…` Clientes → `LL/Exhibicion`; caja del día: reintegro resta del efectivo |
| 2 | Misma venta → segunda devolución de la misma unidad | Frena: "ya se devolvió" |
| 3 | Ticket TPV real (elegido con el dueño) → **solo hasta el detalle** (no confirmar) | Línea con valor pagado y factura |
| 4 | Cambio: devolver 1 u. de la venta 1 + llevar otro producto, neto positivo, efectivo | Descuento solo sobre la diferencia; pedido nuevo en Odoo |
| 5 | Devolución con saldo a favor → usar el saldo en otra venta en BL | Saldo creado; consumido en BL; disponible en 0 |
| 6 | Sin ticket a "Enviar a Rolón" (requiere el grupo RMA) | Ingreso + traslado pendiente; si falta el permiso, el error se ve tal cual y el pedido queda "Con error" |
| 7 | Reintento: cortar el backend después del remito (Ctrl+C en el log del paso 1) y volver a confirmar | No duplica el remito |
| 8 | Con facturación autorizada: NC parcial (escenario 4) y su aplicación a la factura nueva; NC sin ticket (ver qué manda a ARCA como período asociado) | NC-B en el diario de LL, aplicada |

- [ ] **Step 3: Limpieza** — revertir cada remito con su devolución (como en el spike), cancelar pedidos de prueba, borrar saldos de prueba de `pos_credits`, borrar usuarios de prueba. Verificar 0 restos (remitos con origen `LL-…` de prueba sin revertir).

- [ ] **Step 4: Merge y despliegue** — con todo en verde y el OK del dueño: merge de `feature/pos-fase2` a `main` en los dos repos, push (Railway despliega el backend; el front según su despliegue habitual), y anotar en el doc el commit desplegado.

- [ ] **Step 5: Commit del doc**

```bash
git add docs/superpowers/spikes/2026-10-fase2-e2e.md
git commit -m "docs: prueba de punta a punta de cambios y devoluciones

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
