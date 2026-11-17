# Pendientes punto de venta (2026-11-17)

Anotado tal cual llegó, en el mismo orden. Falta definir alcance y prioridad
de cada punto; los vamos detallando de a uno. Debajo de cada uno, lo que
entendí y lo que falta preguntar.

- [x] **Tipo de entrega en las notas del pedido y de la transferencia.**
      Ejemplo: pedido de venta `S11515`, transferencia `RL/PICK/09409`.
      Agregar en notas "Retiro en local", "Envío" o nada.
      - Hecho 17/11 (Reportes `daa8345`): "Envío a domicilio", "Retira en
        Local X" o nada si se lo lleva en el momento; en el pedido y en sus
        remitos. Odoo copia la nota del pedido a la factura (Términos y
        condiciones).
- [x] **Pedido a fabricar.** Un check en la línea; se agrega al detalle de la
      compra y a Odoo.
      - Hecho 17/11 (Reportes `3eeb6b9`, front `f1c2b33`): check "A fabricar
        (entrega a 30 días)" por línea; no puede ser "se lo lleva ahora"; va
        en la nota de Odoo ("A fabricar (30 días): SKU…") y en el recibo y
        el ticket de cambio. No cambia el control de stock.
- [x] **Devolución por falla al depósito de fallas.** Si el motivo de
      devolución es falla, que la mercadería vaya a la ubicación de fallas.
      - Hecho 17/11 (`3414ac1`): con motivo "Falla" se elige solo el destino
        del local que se llame Fallas/Fallados.
      - Decidido 17/11: `Fall/Stock` (192). Destino "Fallas" en la lista
        por defecto de todos los locales: entra al stock del local y se
        traslada a Fall/Stock (como "Enviar a Rolón").
- [ ] **Devolver lo que todavía no se entregó.** Hoy la app dice "Todavía no
      se entregó: 1 × LAMPARA DE MESA LED INALAMBRICA … — eso se anula, no se
      devuelve". Se tiene que poder devolver igual: cancelar el pick, anular
      la línea / el pedido, que vuelva el stock, y que quede pendiente hasta
      que logística devuelva el stock.
      - Decidido 17/11: PICK pendiente → se cancela. PICK ya validado → se
        cancela el OUT y se crea una transferencia de vuelta a stock que
        queda pendiente (logística la ve y la valida).
      - Diseño: lo no entregado aparece como línea devolvible (con el id de
        la línea del pedido); al confirmar se baja la cantidad de la línea
        del pedido en Odoo (Odoo reduce los movimientos pendientes); si el
        PICK estaba hecho, transferencia pendiente de la zona de salida al
        stock del local; NC como en cualquier devolución si estaba facturado.
      - **Bloqueado:** hay que probar en Odoo cómo reacciona este Odoo (PICK +
        OUT) al bajar la cantidad, con un pedido de prueba. Necesita
        autorización para crear ese pedido de prueba.
- [x] **Devolver a diferentes ubicaciones.** Elegir a qué depósito / ubicación
      vuelve cada línea (relacionado con el de fallas).
      - Ya existía: "Destino" por línea al devolver; la lista se configura
        por local en Admin → Locales → Destinos de devolución.
- [x] **Etiquetas en el listado de ventas:** "Envío a domicilio", "Retiro en
      local", "Entregado".
      - Hecho 17/11 (`a8d6a43`): etiquetas y filtro "Entrega" en el historial
        de caja y de admin. "Entregado" = todo se entregó en el acto.
      - Confirmado 17/11: "Entregado" es solo lo que se retira en el momento
        en el local. No hace falta leer Odoo.
- [x] **Movimiento por usuario / vendedor en Odoo.** Que en Odoo se vea qué
      usuario o vendedor hizo cada movimiento.
      - Decidido 17/11: alcanza la nota. Hecho (`3eeb6b9`): "Vendedor: X" en
        la nota del pedido y de los remitos.
- [x] **Pick por foto.** Es el buscador del vendedor: leer el código de
      barras con la cámara y que devuelva el SKU.
      - Hecho 17/11 (Reportes `8b1df9b`, front `22c0e91`): botón de cámara en
        el buscador (@zxing/browser, anda en iPhone, Android y PC). Si el
        código no es el SKU (EAN), el backend lo traduce al SKU. En Odoo
        4689 de 7111 productos tienen código de barras, casi todos igual al
        SKU.

## Venta

- [x] **Diario de venta interna por local.** Hecho 17/11 (Reportes
      `e5e7222`, front `9df1cbb`). Cada local tiene su propio
      diario de venta sin factura (venta interna). Es solo para compras en
      efectivo.
      - Hoy (backend `../Reportes/backend/posConfig.mjs`): VINTE es un solo
        diario global (`internalInvoiceJournalId: 28`, en Ajustes). Las cajas
        internas ya son por local (`internalCashJournalId` 33 / 66 / 80).
      - Entiendo: pasar `internalInvoiceJournalId` a cada local, como
        `invoiceJournalId`.
      - Ya existen en Odoo (revisado 17/11, solo lectura): Las Lomas
        `VINSI` 85, Belgrano `VINBE` 86, Alcorta `VINAL` 87. Precargarlos y
        que se puedan editar en Admin → Locales.
      - Se edita en Admin → Locales; vacío = el general de Ajustes (VINTE).
- [x] **Devoluciones y cambios según el diario.** Hecho 17/11 (Reportes
      `e4fdb86`, front `84e0e7d`). RVENTI = la NC de una venta sin factura:
      en Odoo es la numeración de NC del diario interno (`RVINTE/2026/…`;
      con los diarios por local sale `RVINSI…`, `RVINBE…`). Compra sin
      factura → NC interna en el diario del local, sin ARCA. Cambio sin
      factura → factura interna con la NC aplicada (compensa la cuenta
      corriente). Compra con factura → el cambio solo con factura.
      - Si la venta original fue **con factura** y en el cambio paga la
        diferencia en efectivo, sigue en el diario con factura.
      - Si la venta original fue **sin factura** y en el cambio paga con
        tarjeta o transferencia, hay que pasarla al diario con factura
        (**RVENTI**): se revierte la venta interna y se factura.
      - Se compensa la cuenta corriente del cliente (lo devuelto contra lo
        nuevo).
      - En Odoo no hay ningún diario con código RVENTI (revisado 17/11).
      - A definir: ¿RVENTI es un diario a crear o el nombre de la operación
        de pasar una venta interna a facturada? ¿Se factura todo el cambio o solo lo que paga? ¿Cómo se
        compensa en Odoo: conciliando la reversión contra la factura nueva?
- [x] **Los vendedores solo ven montos a pagar.** En el panel del vendedor,
      nada de con factura / sin factura ni diarios: solo el monto que paga el
      cliente.
      - Confirmado 17/11: como está ahora está bien (ven el detalle, el
        desglose del cambio y el total a pagar). No hay cambios.

## Cajas

- [x] **Movimientos entre cajas en efectivo.** En cada local, pasar efectivo
      entre la caja con factura y la caja sin factura.
      - Hecho 17/11 (Reportes `1a21106`, front `48eb875`): movimiento "Entre
        cajas" en Caja del día (cajero y admin), y el resumen muestra el
        efectivo con y sin factura. No cambia el efectivo esperado. Falta
        mandarlo a Odoo: va con la etapa 2 de la propuesta (aprobar caja).
      - Entiendo: en la caja del local, un movimiento "de caja con factura a
        caja sin factura" (y al revés) con monto y motivo, que va a Odoo
        entre las dos cuentas de caja del local.
      - A definir: ¿quién puede hacerlo (cajero o solo administración)? ¿Se
        aprueba en el cierre como el resto? (Se cruza con la etapa 2 de
        `docs/cobros/propuesta-cobros.html`.)
- [ ] **Cajas del día y conciliación (propuesta de cobros v3).** Detalle en
      `docs/cobros/propuesta-cobros.html` y `docs/cobros/README.md`.
      - Etapa 1: medios "MP posnet" y "MP transferencia", campo "N° de
        operación" en caja, en la venta solo se factura (no se registra el
        cobro en Odoo).
      - Etapa 2: pantalla "Cajas del día" en Admin; aprobar caja manda
        cobros, gastos, retiro (Caja Mayorista Pesos 44 / Caja Interna 52) y
        faltante a Odoo, ya conciliados.
      - Etapa 3: prueba técnica de conciliar por API una línea del extracto
        de MP en Odoo; después, cruce automático y aprobación.
      - A definir (de la propuesta): si el comprobante de transferencia trae
        el ID de MP; lista cerrada de gastos; quién aprueba; si a facturación
        le sirve la factura "no pagada" hasta verificar.

## Odoo (lo hace alguien con acceso, no el POS)

- [ ] Renombrar las cajas internas de Belgrano (66) y Alcorta (80): hoy se
      llaman "Caja Interna Las Lomas de San Isidro (copia)". También la caja
      67 de Belgrano ("Caja Las Lomas (copia)") y el diario de facturas 65
      ("Pto. 4 Facturas Las Lomas (copia)").
- [ ] Activar "secuencia dedicada para notas de crédito" en el diario
      `VINAL` (87, Ventas Internas Alcorta), como ya tienen VINSI y VINBE,
      para que sus NC salgan `RVINAL/…`.

## Dónde está cada cosa

- Front: este repo (`client/`). Backend del POS: `../Reportes/backend/pos*.mjs`
  (repo `reportes-altorancho`).
- Railway: proyecto `gentle-communication`, servicio `reportes-altorancho`.
  Ya tiene `MP_ACCESS_TOKEN`, `POS_ARCA_*` (env `prod`) y
  `POS_INVOICING_ENABLED=true`.
