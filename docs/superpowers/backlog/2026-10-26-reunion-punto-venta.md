# Reunión punto de venta — pendientes (2026-10-26)

Anotado tal cual salió de la reunión, en el orden en que se anotó. Falta
definir alcance y prioridad de cada punto; los vamos detallando de a uno.

- [x] **Stock web pasando por Rolón**: vender en locales con stock web; por
      detrás ese stock tiene que pasar de stock web a stock Rolón.
      **Definido (2026-10-27):**
      - Web (`EC/Stock` 150) está físicamente dentro de Rolón; el local nunca
        descuenta directo de web.
      - Origen nuevo "Web" por línea, elegible siempre que haya stock web.
        Origen por defecto al agregar: local → Rolón → web.
      - Al confirmar: transferencia interna `EC/Stock` → `RL/Stock` validada
        automáticamente; después la línea sale de Rolón como cualquier venta
        de Rolón (mismo remito, mismas entregas; no "se lo lleva ahora").
      - Si la transferencia falla, no se confirma nada y caja ve el error.
      - Stock "infinito" en web: sin tope por ahora (serían productos que no
        están a la venta).
      **Hecho (2026-10-27):** backend f5f83f3 + a04a0e5, front 8bf4c19. El traslado
      lleva motivo "Reasignación de stock para venta desde local" y "Sin bultos"
      (Odoo los exige). Probado contra Odoo real: EC/INT/04910 (revertido con
      RL/INT/06845).
- [ ] **Retiro en otro local** donde haya disponible.
      **Definido (2026-10-27):**
      - Se vende en un local (ej. San Isidro) con stock de otro local
        (ej. Belgrano), de su Stock o su Exhibición.
      - Factura el local que vende (su punto de venta y equipo).
      - Entrega: retira en el local que tiene el stock, en cualquier otro local
        (incluido el que vende) o envío a domicilio. Remito pendiente desde el
        depósito que tiene el stock, con la dirección del punto de retiro o del
        cliente (como hoy "Retira en otro local" desde Rolón).
      - La unidad queda reservada en la app mientras el pedido está abierto,
        igual que el stock propio.
      - El aviso al otro local lo hacen ellos por mensaje interno (el POS no
        avisa).
- [ ] **Búsqueda con ARCA** (pendiente de mi lado).
      **Estado (2026-10-27):** el código ya está (`Reportes/backend/posArca.mjs`,
      padrón A5). Falta generar certificado y clave, habilitar
      `ws_sr_constancia_inscripcion` en ARCA y cargar `POS_ARCA_CUIT`,
      `POS_ARCA_CERT` y `POS_ARCA_KEY` en Railway.
- [ ] **Facturas por email**: el envío de Odoo falla; resolverlo o mandarlas
      nosotros (EmailJS u otro).
      **Definido (2026-10-27):** no se usa el correo de Odoo (no tienen
      Google Workspace ni SMTP propio; probable límite de Odoo).
      - Envío desde el backend con **Resend**, remitente
        `facturas@altorancho.com` (hay que verificar el dominio en Resend con
        registros DNS de altorancho.com).
      - Al confirmar: PDF de la factura desde Odoo, adjunto en un mail
        personalizado (logo, texto, número). También notas de crédito.
      - Se anota en el chatter de la factura en Odoo.
      - Si falla, la venta no se frena: caja ve "Factura no enviada" y
        botón Reenviar (también para mandar a otro mail).
      - Sin copia oculta por ahora.
      - DNS de altorancho.com: GoDaddy (acceso Joaquín). Pendiente: a qué
        casilla van las respuestas (reply-to).
- [x] **Chau GO cuotas.** Sin cambios en el POS: GoCuotas ya no se usa y
      administración lo da de baja en Odoo (la lista de medios sale de ahí).
- [ ] **Gift card como SKU.**
      **Relevado (2026-10-27):**
      - Odoo: 13 SKUs `GFT001AR`…`GFT013AN` ($5.000 a $200.000), precio sin
        IVA, tipo producto con stock. Sin programa de gift cards en Odoo.
      - Los códigos salen de Tiendanube. Se usan enteras (sin saldo).
      - Pedido: pagar en el local con gift card (medio de pago + código),
        validar y marcar usado en Tiendanube; vender gift cards en el local y
        que se cree el código en Tiendanube.
      - A ver: cómo llega a Odoo (línea negativa del SKU vs. solo medio de
        pago) → confirmar con el contador por el IVA.
      - Los códigos son **cupones comunes de Tiendanube** (tienda 2547699):
        `GF` + 10 hex, tipo `absolute` con el monto, `max_uses: 1`,
        incluye envío. Validar: existe, `valid`, `used < max_uses`, tipo
        absolute. Marcar usado: `valid: false` (el contador `used` solo sube
        con compras web). Crear: POST /coupons con el mismo formato.
      - Falta: confirmar que el token de producción tenga `write_coupons`. El
        `.env` local tiene un token vencido (producción en Railway anda).
- [x] **Descuentos sobre total / subtotal.** Ya está (Fase 1, `posPricing.mjs`):
      medio de pago sobre el total de productos → subtotal; descuento extra o
      cupón sobre el subtotal; envío al final sin descuento.
- [x] **Recibo automático** (no ticket de cambio) e impresión automática en la
      impresora SP58.
      **Relevado (2026-10-27):** impresora térmica X-Printer XP-58IIH (58 mm,
      USB). Hoy el ticket de cambio sale de Odoo y lo descargan e imprimen a
      mano.
      - Recibo para el cliente (no fiscal): productos e info de la venta.
      - Ticket de cambio impreso desde nuestro panel, sin descargar.
      - Los dos automáticos al confirmar, sin diálogo de impresión.
      - Propuesta: plantilla HTML de 58 mm + Chrome con `--kiosk-printing`
        en la PC de caja (imprime directo a la impresora predeterminada).
      - Siempre los dos al confirmar: primero el recibo y, unos segundos
        después, el ticket de cambio (para cortar uno antes del otro).
      - Ticket de cambio actual de Odoo (modelo: `Downloads/Ticket de cambio (3).pdf`):
        logo; FECHA dd/mm/aaaa hh:mm; REF. VENTA (ej. `Alcorta/2495`);
        Pedido (ej. `04503-004-0011`); tabla SKU / ESTILO / CANT.; leyendas
        "El cambio de los productos puede gestionarse en cualquiera de nuestras
        sucursales" y "La validez del cambio es efectiva hasta 30 dias después
        de la fecha de compra"; pie www.altorancho.com · 11-3144-0631. Sin
        precios.
      **Hecho (2026-10-27):** front f6fdd47. Falta probar en una caja con la XP-58IIH
      y armar el acceso directo con `--kiosk-printing`.
- [ ] **Caja en dólares**: se puede pagar en USD.
      **Definido (2026-10-27):**
      - Medio de pago "Dólares" separado; combinable con otros (pago dividido).
      - Cotización del día la carga caja (las chicas del local); el monto en
        USD se convierte a pesos con esa cotización.
      - En la caja del día los USD se cuentan aparte (cierre en pesos y en
        dólares).
      - Factura en pesos; en Odoo, medio de pago "Dólares" (verificar que
        exista en `payment.method`).
      - A definir: descuento del pago en USD (¿como efectivo, 15 %?).
- [ ] **Aviso automático al cerrar la caja.**
      **Definido (2026-10-27):** hoy, al cerrar, el local manda a mano un mail
      con toda la info a varias casillas. Al tocar "Cerrar caja" se manda solo
      un mail (Resend, igual que facturas) con el resumen del cierre.
      Destinatarios configurables en Admin. Falta: ejemplo del mail actual.
- [ ] **Venta A y AA separadas.**
      **Estado (2026-10-27):** a definir con el contador / dueños. No se
      implementa venta sin factura. Alternativas posibles si aplican: elegir
      la razón social que factura (otro CUIT / diario), o pedido con
      facturación diferida.
- [ ] **Cada local ve lo suyo**: solo sus ventas.
- [ ] **Cambios y devoluciones web y locales** (no solo locales). Ver con Mili
      y Luji cómo lo hacen hoy.
      - [x] Locales (app, POS de Odoo, Tiendanube, sin ticket): en producción
            desde el 2026-10-26 (Fase 2).
      - [ ] Confirmar con el contador: devolución sin ticket sin nota de
            crédito.
- [ ] **Finalizar el día**: panel limpio.
- [ ] **Limitar cuotas** / definir de dónde salen.
