// =====================================================================
//  Acceso a datos: tarjetas (clientes)
// =====================================================================
const { get, query, execute } = require('./connection');

const COLUMNA_SAFE =
  'id, comercioId, nombre, email, puntos, premios, activo, createdAt, updatedAt';

async function findById(id) {
  return get('SELECT * FROM tarjetas WHERE id = ?', [id]);
}

async function findByIdSafe(id) {
  return get(`SELECT ${COLUMNA_SAFE} FROM tarjetas WHERE id = ?`, [id]);
}

/**
 * Login por email. Si el email existe en varios comercios hay que
 * indicar comercioId para desambiguar.
 */
async function findByEmail(email, comercioId = null) {
  if (comercioId) {
    return get('SELECT * FROM tarjetas WHERE email = ? AND comercioId = ?', [
      email,
      comercioId,
    ]);
  }
  const filas = await query('SELECT * FROM tarjetas WHERE email = ?', [email]);
  if (filas.length > 1) {
    const err = new Error(
      'El email está asociado a varios comercios: indica comercioId (idRandomLargo del comercio)'
    );
    err.status = 409;
    err.code = 'EMAIL_AMBIGUO';
    throw err;
  }
  return filas[0];
}

async function listByComercio(comercioId) {
  return query(
    `SELECT ${COLUMNA_SAFE} FROM tarjetas WHERE comercioId = ? ORDER BY nombre`,
    [comercioId]
  );
}

/** Todas las tarjetas (admin), con filtro opcional por comercio. */
async function list({ comercioId = null } = {}) {
  if (comercioId) {
    return query(
      `SELECT ${COLUMNA_SAFE} FROM tarjetas WHERE comercioId = ? ORDER BY comercioId, nombre`,
      [comercioId]
    );
  }
  return query(`SELECT ${COLUMNA_SAFE} FROM tarjetas ORDER BY comercioId, nombre`);
}

/**
 * Bloquea la fila de la tarjeta dentro de la transacción (SELECT ... FOR UPDATE).
 * Dos movimientos concurrentes sobre la misma tarjeta se serializan aquí.
 *
 * Devuelve la tarjeta completa o `undefined` si no existe / no pertenece
 * al comercio indicado.
 */
async function lockForUpdate(conn, tarjetaId, comercioId = null) {
  let sql = 'SELECT * FROM tarjetas WHERE id = ?';
  const params = [tarjetaId];
  if (comercioId !== null) {
    sql += ' AND comercioId = ?';
    params.push(comercioId);
  }
  sql += ' FOR UPDATE';
  const [rows] = await conn.query(sql, params);
  return rows[0];
}

/** Actualiza saldos (sólo dentro de transacción, pasando la conexión). */
async function updateSaldos(conn, tarjetaId, puntos, premios) {
  await conn.query('UPDATE tarjetas SET puntos = ?, premios = ? WHERE id = ?', [
    puntos,
    premios,
    tarjetaId,
  ]);
}

async function create(datos) {
  const result = await execute(
    `INSERT INTO tarjetas (comercioId, nombre, email, puntos, premios, passwordHash, activo)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      datos.comercioId,
      datos.nombre,
      datos.email,
      datos.puntos ?? 0,
      datos.premios ?? 0,
      datos.passwordHash,
      datos.activo === false ? 0 : 1,
    ]
  );
  return findById(result.insertId);
}

module.exports = {
  COLUMNA_SAFE,
  findById,
  findByIdSafe,
  findByEmail,
  list,
  listByComercio,
  lockForUpdate,
  updateSaldos,
  create,
};
