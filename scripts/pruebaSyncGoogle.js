// =====================================================================
//  Prueba real de la SINCRONIZACIÓN de saldos con Google Wallet
//      node scripts/pruebaSyncGoogle.js
//  1) INSERTA un objeto de prueba (directamente contra la API, NO toca BD)
//  2) PATCH con nuestra función actualizarSaldos()  -> comprobar saldos
//  3) GET  -> comprobar que el resto de campos NO se ha tocado
//  4) Marca el objeto de prueba como 'expired' (Google NO permite DELETE)
// =====================================================================
require('../src/config/env').validarEnv();
const gw = require('../src/services/googleWalletService');

const CLASE = process.argv[2] || '3388000000023208299.322bcbe4eb2e4f2322a16ed1f1cf259f7e8357940aaa62f5';
const OBJETO = `3388000000023208299.TEST_SYNC_${Date.now()}`;
const URL_OBJETO = 'https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject';

async function llamada(metodo, cuerpo = null) {
  const token = await gw.obtenerToken();
  // El POST va a la colección; el resto van al id concreto.
  const url = metodo === 'POST' ? URL_OBJETO : `${URL_OBJETO}/${encodeURIComponent(OBJETO)}`;
  const r = await fetch(url, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = await r.json().catch(() => ({}));
  return { status: r.status, datos };
}

async function main() {
  console.log('Objeto de prueba:', OBJETO);

  // 1) INSERT -----------------------------------------------------------
  const insert = await llamada('POST', {
    id: OBJETO,
    classId: CLASE,
    state: 'ACTIVE',
    accountId: '999',
    accountName: 'Prueba Sync',
    barcode: { type: 'QR_CODE', value: 'http://localhost:5174/comercio/captura/999' },
    loyaltyPoints: { label: 'Puntos', balance: { int: 0 } },
    secondaryLoyaltyPoints: { label: 'Premios', balance: { int: 0 } },
  });
  console.log('INSERT ->', insert.status, insert.status < 300 ? 'OK' : JSON.stringify(insert.datos));
  if (insert.status >= 300) throw new Error('No se pudo crear el objeto de prueba');

  {
    // 2) PATCH con nuestra función --------------------------------------
    const estado = await gw.actualizarSaldos({ objectId: OBJETO, puntos: 7, premios: 2 });
    console.log('actualizarSaldos(7 puntos, 2 premios) ->', estado);
    if (estado !== 'sincronizado') throw new Error(`Esperaba 'sincronizado' y llegó '${estado}'`);

    // 3) GET: comprobar saldos Y que el resto sigue intacto --------------
    const lectura = await llamada('GET');
    const o = lectura.datos;
    const num = (b) => (b && typeof b.int === 'string' ? Number(b.int) : b?.int);
    console.log('\n--- objeto tras el PATCH ---');
    console.log('puntos  :', num(o.loyaltyPoints?.balance));
    console.log('premios :', num(o.secondaryLoyaltyPoints?.balance));
    console.log('classId :', o.classId);
    console.log('state   :', o.state);
    console.log('barcode :', o.barcode?.value);
    console.log('accountId/accountName:', o.accountId, '/', o.accountName);

    const ok =
      num(o.loyaltyPoints?.balance) === 7 &&
      num(o.secondaryLoyaltyPoints?.balance) === 2 &&
      o.classId === CLASE &&
      String(o.state).toLowerCase() === 'active' &&
      o.barcode?.value === 'http://localhost:5174/comercio/captura/999' &&
      o.accountId === '999';
    console.log('\nVERIFICACIÓN:', ok ? 'TODO CORRECTO' : 'HAY ALGO QUE NO CUADRA');
    if (!ok) process.exitCode = 1;

    // 4) Objeto inexistente -> 'sin_objeto' ------------------------------
    const noExiste = await gw.actualizarSaldos({
      objectId: '3388000000023208299.NO_EXISTE_NUNCA',
      puntos: 1,
      premios: 0,
    });
    console.log('objeto inexistente ->', noExiste, noExiste === 'sin_objeto' ? '(OK)' : '(FALLO)');
    if (noExiste !== 'sin_objeto') process.exitCode = 1;

    // NOTA: Google NO permite borrar objetos/clases (FAQ oficial), así que la
    // "limpieza" consiste en marcar el objeto de prueba como 'expired' para
    // que quede inerte (nadie lo tiene guardado en su Wallet).
    const token = await gw.obtenerToken();
    const r = await fetch(`${URL_OBJETO}/${OBJETO}?updateMask=state`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'expired' }),
    });
    console.log(
      '\nLimpieza (state=expired) ->',
      r.status,
      r.status < 300 ? 'OK (Google no permite DELETE, queda inerte)' : 'FALLO'
    );
    if (r.status >= 300) process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('FALLO:', e.message);
  process.exit(1);
});
