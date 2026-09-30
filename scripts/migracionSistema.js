// =====================================================================
//  MIGRACIÓN v1.7: columna `sistema` en tarjetas  ->  node scripts/migracionSistema.js
// ---------------------------------------------------------------------
//  Idempotente: se puede ejecutar tantas veces como haga falta.
//    1) ALTER TABLE tarjetas ADD COLUMN sistema VARCHAR(10) NOT NULL
//       DEFAULT 'google'   (si no existe)
//    2) Índice único (comercioId, email, sistema) en sustitución de
//       (comercioId, email): el mismo email puede tener 1 tarjeta
//       google + 1 tarjeta apple por comercio (son independientes).
//  Las filas existentes quedan todas con sistema = 'google'.
// =====================================================================
require('../src/config/env'); // carga el .env (dotenv) antes que la BD
const { query, execute } = require('../src/db/connection');
const { pool } = require('../src/config/db');

const COLUMNA = 'sistema';
const INDICE = 'uq_tarjetas_comercio_email';

async function main() {
  // 1) Columna -------------------------------------------------------
  const cols = await query(`SHOW COLUMNS FROM tarjetas LIKE '${COLUMNA}'`);
  if (cols.length === 0) {
    await execute(
      `ALTER TABLE tarjetas ADD COLUMN ${COLUMNA} VARCHAR(10) NOT NULL DEFAULT 'google' AFTER email`
    );
    console.log(`OK: columna ${COLUMNA} añadida (todas las filas = 'google')`);
  } else {
    console.log(`OK: la columna ${COLUMNA} ya existe, nada que hacer`);
  }

  // 2) Índice único --------------------------------------------------
  const idx = await query(`SHOW INDEX FROM tarjetas WHERE Key_name = '${INDICE}'`);
  const columnasIdx = idx.map((f) => f.Column_name);
  if (idx.length === 0) {
    await execute(
      `ALTER TABLE tarjetas ADD UNIQUE KEY ${INDICE} (comercioId, email, ${COLUMNA})`
    );
    console.log(`OK: índice único ${INDICE} creado (comercioId, email, ${COLUMNA})`);
  } else if (columnasIdx.length === 3 && columnasIdx[2] === COLUMNA) {
    console.log(`OK: el índice ${INDICE} ya incluye ${COLUMNA}`);
  } else {
    await execute(`ALTER TABLE tarjetas DROP INDEX ${INDICE}`);
    await execute(
      `ALTER TABLE tarjetas ADD UNIQUE KEY ${INDICE} (comercioId, email, ${COLUMNA})`
    );
    console.log(
      `OK: índice ${INDICE} reemplazado (${columnasIdx.join(', ')} -> comercioId, email, ${COLUMNA})`
    );
  }

  // 3) Verificación --------------------------------------------------
  const filas = await query(
    `SELECT ${COLUMNA}, COUNT(*) AS total FROM tarjetas GROUP BY ${COLUMNA}`
  );
  console.log('Verificación (sistema -> nº tarjetas):', filas);
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('ERROR en la migración:', err.message);
    await pool.end();
    process.exit(1);
  });
