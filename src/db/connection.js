// =====================================================================
//  Utilidades genéricas de acceso a la base de datos
//  (query / get / execute + transacciones con rollback automático)
// =====================================================================
const { pool } = require('../config/db');

/** Ejecuta una consulta y devuelve las filas. */
async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/** Devuelve la primera fila o undefined. */
async function get(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows[0];
}

/** Ejecuta un INSERT/UPDATE/DELETE y devuelve info del resultado. */
async function execute(sql, params = []) {
  const [result] = await pool.query(sql, params);
  return result;
}

/**
 * Ejecuta `fn` dentro de una transacción.
 *  - `fn(conn)` recibe una conexión dedicada: TODAS las queries de la
 *    función deben usar esa conexión.
 *  - Si `fn` lanza cualquier error => ROLLBACK automático.
 *  - Si termina bien => COMMIT.
 *
 * Garantiza atomicidad: o se aplican todos los cambios (saldo + registro
 * de la operación) o no se aplica ninguno.
 *
 * @param {(conn: import('mysql2/promise').PoolConnection) => Promise<any>} fn
 */
async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
      const resultado = await fn(conn);
      await conn.commit();
      return resultado;
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {
      /* si el rollback falla, propagamos el error original */
    }
    throw err;
  } finally {
    conn.release();
  }
}

/** Wrapper para usar las utilidades con una conexión de transacción. */
const q = (conn) => ({
  query: async (sql, params = []) => (await conn.query(sql, params))[0],
  get: async (sql, params = []) => (await conn.query(sql, params))[0][0],
  execute: async (sql, params = []) => (await conn.query(sql, params))[0],
});

module.exports = { query, get, execute, withTransaction, q };
