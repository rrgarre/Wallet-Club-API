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

  // Migración sobre tablas YA existentes (CREATE TABLE IF NOT EXISTS no
  // añade columnas nuevas a una tabla que ya está creada).
  await asegurarColumnas();

  const [filas] = await pool.query('SHOW TABLES');
  const tablas = filas.map((f) => Object.values(f)[0]);
  console.log('Listo. Tablas en la BD:', tablas.join(', '));

  await pool.end();
}

const COLUMNAS_A_SEGURAS = [
  ['comercios', 'googleWalletClaseId', 'VARCHAR(128) NULL'],
  ['comercios', 'googleWalletClaseEstado', 'VARCHAR(32) NULL'],
  ['comercios', 'googleWalletClaseCreadaEn', 'TIMESTAMP NULL'],
  ['tarjetas', 'googleWalletObjetoId', 'VARCHAR(128) NULL'],
];

async function asegurarColumnas() {
  for (const [tabla, columna, definicion] of COLUMNAS_A_SEGURAS) {
    const [filas] = await pool.query(
      `SELECT COUNT(*) AS n FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
      [tabla, columna]
    );
    if (Number(filas[0].n) === 0) {
      await pool.query(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`);
      console.log(`  + columna ${tabla}.${columna}`);
    }
  }
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
