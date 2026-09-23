// =====================================================================
//  Instalación del esquema en la BD remota
//      npm run db:setup              -> crea las tablas que falten
//      npm run db:setup -- --drop    -> BORRA antes las 4 tablas y las
//                                        crea de nuevo (¡pierde datos!)
// =====================================================================
const fs = require('fs');
const path = require('path');

require('../src/config/env').validarEnv();
const { validarCredenciales, cerrarPool, pool } = require('../src/config/db');

const TABLAS = ['operaciones', 'tarjetas', 'comercios', 'admins'];

function sentenciasDesde(sql) {
  return sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))            // comentarios (a inicio o a mitad de línea)
    .join(' ')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main() {
  const conDrop = process.argv.includes('--drop');
  validarCredenciales();

  if (conDrop) {
    console.log('Borrando tablas:', TABLAS.join(', '));
    // Respeta las claves ajenas: primero las que referencian.
    await pool.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of TABLAS) {
      await pool.query(`DROP TABLE IF EXISTS ${t}`);
    }
    await pool.query('SET FOREIGN_KEY_CHECKS = 1');
  }

  const fichero = path.join(__dirname, '..', 'schema.sql');
  const sql = fs.readFileSync(fichero, 'utf8');
  const sentencias = sentenciasDesde(sql);

  for (const s of sentencias) {
    await pool.query(s);
  }

  const [filas] = await pool.query('SHOW TABLES');
  const tablas = filas.map((f) => Object.values(f)[0]);
  console.log('Listo. Tablas en la BD:', tablas.join(', '));

  await pool.end();
}

main().catch(async (err) => {
  console.error('ERROR:', err.message);
  try {
    await pool.end();
  } catch (_) {
    /* noop */
  }
  process.exit(1);
});
