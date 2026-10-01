// =====================================================================
//  MIGRACIÓN v1.10: techo de premios por comercio
//  ->  node scripts/migracionMaximoPremios.js
// ---------------------------------------------------------------------
//  Idempotente: se puede ejecutar tantas veces como haga falta.
//    ADD COLUMN maximoPremios INT NOT NULL DEFAULT 0  (si no existe)
//
//  DEFAULT 0 = SIN LÍMITE (así quedan también los comercios existentes:
//  nadie nota el cambio hasta que el admin ponga un techo distinto de 0).
// =====================================================================
require('../src/config/env'); // carga el .env (dotenv) antes que la BD
const { query, execute } = require('../src/db/connection');
const { pool } = require('../src/config/db');

async function main() {
  const cols = await query(`SHOW COLUMNS FROM comercios LIKE 'maximoPremios'`);
  if (cols.length === 0) {
    await execute(
      'ALTER TABLE comercios ADD COLUMN maximoPremios INT NOT NULL DEFAULT 0 AFTER premioDescripcion'
    );
    console.log('OK: columna comercios.maximoPremios añadida (DEFAULT 0 = sin límite)');
  } else {
    console.log('OK: la columna comercios.maximoPremios ya existe');
  }

  const filas = await query(
    'SELECT COUNT(*) AS total, SUM(maximoPremios = 0) AS sinLimite FROM comercios'
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
