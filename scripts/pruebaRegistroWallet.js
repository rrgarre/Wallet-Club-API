// =====================================================================
//  Prueba real del registro con enlace Google Wallet + LIMPIEZA
//      node scripts/pruebaRegistroWallet.js
//  Registra una tarjeta de prueba en el comercio indicado, muestra el
//  enlace y su payload decodificado, y BORRA la fila de prueba al final.
// =====================================================================
require('../src/config/env').validarEnv();
const { pool, cerrarPool } = require('../src/config/db');

const BASE = process.env.URL_API || 'http://localhost:3000';
const ID_RANDOM = process.argv[2] || '322bcbe4eb2e4f2322a16ed1f1cf259f7e8357940aaa62f5';

async function main() {
  const email = `prueba.wallet.${Date.now()}@temp.com`;

  const r = await fetch(`${BASE}/api/registro/tarjeta/${ID_RANDOM}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: 'Prueba Wallet', email, password: 'secreto1' }),
  });
  const j = await r.json();
  console.log('HTTP registro:', r.status);
  console.log('usuario:', JSON.stringify(j.usuario, null, 2));
  console.log('comercio:', JSON.stringify(j.comercio, null, 2));
  console.log('googleWalletUrl:', j.googleWalletUrl);

  let id = j.usuario && j.usuario.id;
  try {
    if (!j.googleWalletUrl) throw new Error('No llegó googleWalletUrl');

    const jwtUrl = j.googleWalletUrl.split('/').pop();
    const partes = jwtUrl.split('.');
    const payload = JSON.parse(
      Buffer.from(partes[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
    );
    console.log('\n--- payload del JWT (lo que Google leerá) ---');
    console.log('iss:', payload.iss);
    console.log('aud:', payload.aud, '| typ:', payload.typ);
    console.log(JSON.stringify(payload.payload.loyaltyObjects[0], null, 2));

    // Comprobación en BD
    const [filas] = await pool.query(
      'SELECT id, nombre, email, puntos, premios, googleWalletObjetoId FROM tarjetas WHERE id = ?',
      [id]
    );
    console.log('\nfila en BD:', JSON.stringify(filas[0], null, 2));

    const claseEsperada = `3388000000023208299.${ID_RANDOM}`;
    const obj = payload.payload.loyaltyObjects[0];
    const ok =
      obj.classId === claseEsperada &&
      obj.id === filas[0].googleWalletObjetoId &&
      obj.barcode.value === `${process.env.FRONT_URL}/comercio/captura/${id}` &&
      obj.loyaltyPoints.balance.int === 0 &&
      obj.secondaryLoyaltyPoints.balance.int === 0 &&
      obj.accountName === 'Prueba Wallet';
    console.log('\nVERIFICACIÓN:', ok ? 'TODO CORRECTO' : 'HAY ALGO QUE NO CUADRA');
  } finally {
    if (id) {
      await pool.query('DELETE FROM tarjetas WHERE id = ?', [id]);
      console.log(`\nFila de prueba (id=${id}) BORRADA de la BD.`);
    }
    await cerrarPool();
  }
}

main().catch(async (e) => {
  console.error('FALLO:', e.message);
  try { await cerrarPool(); } catch (_) { /* noop */ }
  process.exit(1);
});
