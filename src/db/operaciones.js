// =====================================================================
//  Acceso a datos: operaciones (libro de movimientos)
// =====================================================================
const { get, query } = require('./connection');

const COLUMNA_SAFE =
  'id, tarjetaId, comercioId, tipo, puntosDelta, premiosDelta, descripcion, nombre, codigoCamarero, createdAt';

async function findById(id) {
  return get(`SELECT ${COLUMNA_SAFE} FROM operaciones WHERE id = ?`, [id]);
}

/**
 * Búsqueda por idempotencia (reintentos del cliente).
 * Se llama ANTES de la transacción para detectar reintentos baratos, y
 * también después si la inserción choca con la clave única.
 * @param {number} tarjetaId
 * @param {string} idempotenciaKey
 * @param {object|null} conn conexión de transacción opcional
 */
async function findByIdempotencyKey(tarjetaId, idempotenciaKey, conn = null) {
  const sql = `SELECT ${COLUMNA_SAFE} FROM operaciones WHERE tarjetaId = ? AND idempotenciaKey = ?`;
  const params = [tarjetaId, idempotenciaKey];
  if (conn) {
    const [rows] = await conn.query(sql, params);
    return rows[0];
  }
  return get(sql, params);
}

/**
 * Inserta una operación con la conexión de la transacción.
 * Si la clave de idempotencia ya existe (carrera entre dos reintentos),
 * mysql2 lanza ER_DUP_ENTRY y toda la transacción hace rollback.
 */
async function insert(conn, datos) {
  const [result] = await conn.query(
    `INSERT INTO operaciones
       (tarjetaId, comercioId, tipo, puntosDelta, premiosDelta, descripcion, nombre, codigoCamarero, idempotenciaKey)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      datos.tarjetaId,
      datos.comercioId,
      datos.tipo,
      datos.puntosDelta,
      datos.premiosDelta,
      datos.descripcion ?? null,
      datos.nombre ?? null,
      datos.codigoCamarero ?? null,
      datos.idempotenciaKey ?? null,
    ]
  );
  return result.insertId;
}

/**
 * Listado para admin, con filtros y paginación.
 * @param {{tarjetaId?, comercioId?, tipo?, desde?, hasta?, pagina?, tamano?}} filtros
 */
async function list(filtros = {}) {
  const where = [];
  const params = [];

  if (filtros.tarjetaId) {
    where.push('o.tarjetaId = ?');
    params.push(filtros.tarjetaId);
  }
  if (filtros.comercioId) {
    where.push('o.comercioId = ?');
    params.push(filtros.comercioId);
  }
  if (filtros.tipo) {
    where.push('o.tipo = ?');
    params.push(filtros.tipo);
  }
  if (filtros.desde) {
    where.push('o.createdAt >= ?');
    params.push(filtros.desde);
  }
  if (filtros.hasta) {
    where.push('o.createdAt <= ?');
    params.push(filtros.hasta);
  }

  const pagina = Math.max(1, Number(filtros.pagina) || 1);
  const tamano = Math.min(200, Math.max(1, Number(filtros.tamano) || 50));
  const offset = (pagina - 1) * tamano;
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = await get(
    `SELECT COUNT(*) AS total FROM operaciones o ${whereSql}`,
    params
  );

  const filas = await query(
    `SELECT o.id, o.tarjetaId, o.comercioId, o.tipo, o.puntosDelta, o.premiosDelta,
            o.descripcion, o.nombre, o.codigoCamarero, o.idempotenciaKey, o.createdAt,
            t.nombre AS tarjetaNombre, t.email AS tarjetaEmail,
            c.nombre AS comercioNombre
       FROM operaciones o
       LEFT JOIN tarjetas t ON t.id = o.tarjetaId
       LEFT JOIN comercios c ON c.id = o.comercioId
       ${whereSql}
      ORDER BY o.createdAt DESC, o.id DESC
      LIMIT ? OFFSET ?`,
    [...params, tamano, offset]
  );

  return { total: total.total, pagina, tamano, filas };
}

/** Historial de una tarjeta. */
async function listByTarjeta(tarjetaId, limite = 100, conn = null) {
  const sql = `SELECT ${COLUMNA_SAFE} FROM operaciones
      WHERE tarjetaId = ? ORDER BY createdAt DESC, id DESC LIMIT ?`;
  const params = [tarjetaId, Number(limite) || 100];
  if (conn) {
    const [rows] = await conn.query(sql, params);
    return rows;
  }
  return query(sql, params);
}

module.exports = { findById, findByIdempotencyKey, insert, list, listByTarjeta };
