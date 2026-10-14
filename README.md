# Alto Rancho — Punto de venta

Punto de venta para los locales de Alto Rancho. Tres paneles que hablan con
el backend de Reportes (rutas bajo `/api/pos`): los vendedores arman el
pedido en el salón, caja lo cobra y lo confirma en Odoo (pedido, stock de
todos los depósitos y facturación automática) y administración maneja
usuarios, locales y configuración.

El backend **no está en este repo**: corre dentro de `Reportes/backend`.
Este repo tiene solo el frontend (`client/`).

## Correrlo

```bash
cd client
npm install
VITE_API_URL=http://localhost:3000 npm run dev   # desarrollo
npm run build                                    # build estático en client/dist
```

`VITE_API_URL` es la URL del backend (sin `/api/pos`). Por defecto
`http://localhost:3000`.

## Rutas

Las rutas usan hash, así que cualquier host estático alcanza (sirve
`index.html` y listo):

- `/#/vendedor` — login con PIN; armado de pedidos en tablet o celular.
- `/#/caja` — login con usuario y contraseña; escritorio con menú lateral.
- `/#/admin` — login con usuario y contraseña (admin o superadmin);
  escritorio con menú lateral.

Cada panel guarda su propia sesión en el navegador, así que se pueden tener
abiertos a la vez en pestañas distintas.

## Despliegue

Producción: `https://puntoventa.altorancho.com`, backend en
`https://reportes-altorancho-production.up.railway.app`.

```bash
cd client
VITE_API_URL=https://reportes-altorancho-production.up.railway.app npm run build
```

Verificar que `client/dist/assets/*.js` exista después del build (Dropbox a
veces bloquea `dist`: si falla, reintentar). Luego subir el contenido de
`client/dist` al hosting estático de `puntoventa.altorancho.com`. Las rutas
son `/#/vendedor`, `/#/caja` y `/#/admin`.
