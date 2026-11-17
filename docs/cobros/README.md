# Cobros y cajas: propuesta y datos de Mercado Pago

- `propuesta-cobros.html`: propuesta v3 (17/11/2026). Versión online: https://claude.ai/artifact/QGTyfDFDWpJiGHLWxC8ZFC
- `mp-explorar.mjs`: script de solo lectura que agrupa los cobros de Mercado Pago de los últimos 30 días.

## Decisiones

- La conciliación se hace en el POS. En la venta solo se factura; al aprobar, administración manda a Odoo los cobros ya conciliados.
- Retiro diario a caja central: con factura ("blanca") → **Caja Mayorista Pesos**; sin factura ("negra") → **Caja Interna**.
- Solo se registran faltantes ("Pérdida por diferencia de efectivo"). Un sobrante se marca para revisar.
- El POS no crea movimientos de Mercado Pago (la cuenta es compartida con web y mayorista): concilia las líneas `Cobro <id>` del extracto que se importa en Odoo.

## Mercado Pago (cuenta ALTORANCHO.COM, user 348303971)

Revisado por API el 17/11/2026, sin modificar nada.

- `Cobro 188985161099` en el extracto de Odoo = `GET /v1/payments/188985161099`. El número de operación es el ID del pago.
- Búsqueda: `GET /v1/payments/search?range=date_created&begin_date=NOW-30DAYS&end_date=NOW&limit=50&offset=N` (máx. 50 por página, offset hasta 10000). El filtro `operation_type` no filtró; se filtra en el cliente.
- Cobros de posnet: `point_of_interaction.type` = `POINT` (tarjeta) o `INSTORE` (QR desde el posnet). Traen `store_id`, `pos_id` y el serial del equipo.
- Transferencias entrantes: `operation_type = account_fund`, `PSP_TRANSFER / INTER_PSP`. No traen local ni referencia; solo monto, hora y CUIT del pagador. ~820 por mes en todos los canales.
- Liberación del dinero (no afecta la verificación, el cobro se ve al aprobarse): posnet crédito 19 días, débito 7 días, transferencias al instante, web con tarjeta 5 días.
- Cada pago trae `fee_details` (mercadopago_fee, financing_fee) y `charges_details` con retenciones (IIBB, débitos y créditos), y `transaction_details.net_received_amount`.

### Posnets por local

| Local | store_id | pos_id | Seriales |
| --- | --- | --- | --- |
| Las Lomas | 47430197 | 102442156 | N950NCC403269611 |
| Belgrano | 72892788 | 115956239 | N950NCD100041304, N950NCC403269617 |
| Alcorta | 83180306 | 118496520 | N950NCD100041266 |

Otros locales en la cuenta: Showroom 31215210, Tigre 66111922, Feria 69097226.

### Acceso

El token es el de la app "348303971 - MercadoPago application" (App ID 8531349237941821). Se obtiene con el MCP de Mercado Pago (`get_credentials`) o desde el panel de desarrolladores. **No commitearlo**: usar la variable `MP_ACCESS_TOKEN`.

```
MP_ACCESS_TOKEN=... node docs/cobros/mp-explorar.mjs
```

## Pendiente

- Prueba técnica: conciliar por API una línea del extracto de Mercado Pago en Odoo 16 (account_accountant).
- Ver si el comprobante de transferencia que muestra el cliente trae el ID de Mercado Pago.
- Código de cuenta de "Caja Mayorista Pesos" en Odoo; lista cerrada de gastos; quién aprueba.
