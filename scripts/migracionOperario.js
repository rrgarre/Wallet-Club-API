// =====================================================================
//  MIGRACIÓN v1.8: login de comercio por nombre de usuario + rol operario
//  ->  node scripts/migracionOperario.js
// ---------------------------------------------------------------------
//  Idempotente: se puede ejecutar tantas veces como haga falta.
//    1) ADD COLUMN nombreUsuario VARCHAR(32) NULL  (si no existe)
//    2) ADD COLUMN operarioHash VARCHAR(255) NULL  (si no existe)
//    3) UNIQUE KEY uq_comercios_nombreUsuario (nombreUsuario)
//
//  Los comercios EXISTENTES quedan con ambos campos NULL a propósito:
//  el admin les asigna nombre de usuario y contraseña de operario con
//  PATCH /api/admin/comercios/:id. Ojo: mientras estén NULL, esos
//  comercios NO pueden iniciar sesión (el login ya no usa idRandomLargo).
// =====================================================================
require('../src/config/env'); // carga el .env (dotenv) antes que la BD
const { query, execute } = require('../src/db/connection');
const { pool } = require('../src/config/db');

async function ensureColumn(tabla, columna, definicion, despuesDe) {
  const cols = await query(`SHOW COLUMNS FROM ${tabla} LIKE '${columna}'`);
  if (cols.length === 0) {
    await execute(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion} AFTER ${despuesDe}`);
    console.log(`OK: columna ${tabla}.${columna} añadida`);
  } else {
    console.log(`OK: la columna ${tabla}.${columna} ya existe`);
  }
}

async function main() {
  await ensureColumn('comercios', 'nombreUsuario', 'VARCHAR(32) NULL', 'nombre');
  await ensureColumn('comercios', 'operarioHash', 'VARCHAR(255) NULL', 'passwordHash');

  const idx = await query(
    `SHOW INDEX FROM comercios WHERE Key_name = 'uq_comercios_nombreUsuario'`
  );
  if (idx.length === 0) {
    await execute('ALTER TABLE comercios ADD UNIQUE KEY uq_comercios_nombreUsuario (nombreUsuario)');
    console.log('OK: índice único uq_comercios_nombreUsuario creado');
  } else {
    console.log('OK: el índice uq_comercios_nombreUsuario ya existe');
  }

  // Verificación
  const filas = await query(
    'SELECT COUNT(*) AS total, SUM(nombreUsuario IS NULL) AS sinUsuario FROM comercios'
  );
  console.log('Verificación:', filas[0]);
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('ERROR en la migración:', err.message);
    await pool.end();
    process.exit(1);
  });
