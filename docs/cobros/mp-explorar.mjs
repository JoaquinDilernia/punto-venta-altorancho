// Solo lectura. Agrupa los cobros aprobados de Mercado Pago de los últimos 30 días
// por canal y por posnet/local. Uso: MP_ACCESS_TOKEN=... node docs/cobros/mp-explorar.mjs
const T = process.env.MP_ACCESS_TOKEN;
if (!T) { console.error('Falta MP_ACCESS_TOKEN'); process.exit(1); }

const get = async (path) => {
  const r = await fetch('https://api.mercadopago.com' + path, { headers: { Authorization: 'Bearer ' + T } });
  if (!r.ok) throw new Error(`${r.status} ${path}: ${await r.text()}`);
  return r.json();
};

const all = [];
for (let off = 0; off < 10000; off += 50) {
  const p = await get(`/v1/payments/search?sort=date_created&criteria=desc&range=date_created&begin_date=NOW-30DAYS&end_date=NOW&limit=50&offset=${off}`);
  all.push(...p.results);
  if (p.results.length < 50) break;
}
const ok = all.filter((x) => x.status === 'approved');
console.log(`${all.length} pagos, ${ok.length} aprobados`);

const add = (map, key, x) => {
  const e = (map[key] ??= { n: 0, monto: 0, liberacionDias: {} });
  e.n++;
  e.monto = Math.round(e.monto + x.transaction_amount);
  const d = Math.round((new Date(x.money_release_date) - new Date(x.date_approved)) / 864e5);
  e.liberacionDias[d] = (e.liberacionDias[d] || 0) + 1;
};

const porCanal = {};
const porPosnet = {};
for (const x of ok) {
  const poi = x.point_of_interaction || {};
  add(porCanal, [x.operation_type, poi.type, poi.sub_type, x.payment_type_id].filter(Boolean).join(' | '), x);
  if (poi.type === 'POINT' || poi.type === 'INSTORE') {
    add(porPosnet, `${poi.device?.serial_number} store ${x.store_id} pos ${x.pos_id}`, x);
  }
}
console.log('\nPor canal'); console.table(porCanal);
console.log('\nPor posnet'); console.table(porPosnet);

const stores = await get('/users/me').then((me) => get(`/users/${me.id}/stores/search?limit=50`));
console.log('\nLocales'); console.table(stores.results.map((s) => ({ id: s.id, nombre: s.name })));
