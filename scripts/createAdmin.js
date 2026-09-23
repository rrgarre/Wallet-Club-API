// =====================================================================
//  Crea (o actualiza) un administrador:
//      npm run admin -- <nombre> <password>
//  Nunca guarda la password plana: sólo el hash bcrypt.
// =====================================================================
require('dotenv').config();

const bcrypt = require('bcryptjs');
const { validarCredenciales, cerrarPool } = require('../src/config/db');
const dbAdmins = require('../src/db/admin');

async function main() {
  const [, , nombre, password] = process.argv;

  if (!nombre || !password) {
    console.error('Uso:  npm run admin -- <nombre> <password>');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('La contraseña debe tener al menos 8 caracteres.');
    process.exit(1);
  }

  validarCredenciales();
  const hash = await bcrypt.hash(password, 10);
  const admin = await dbAdmins.upsert(nombre, hash);

  console.log(`Admin listo -> id=${admin.id}, nombre=${admin.nombre}`);
  await cerrarPool();
}

main().catch(async (err) => {
  console.error('Error:', err.message);
  try {
    await cerrarPool();
  } catch (_) {
    /* noop */
  }
  process.exit(1);
});
