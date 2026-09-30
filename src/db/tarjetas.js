// =====================================================================
//  Acceso a datos: tarjetas (clientes)
// =====================================================================
const { get, query, execute } = require('./connection');
const { conflict } = require('../utils/errors');

const COLUMNA_SAFE =
  'id, comercioId, nombre, email, sistema, puntos, premios, activo, createdAt, updatedAt, googleWalletObjetoId';

async function findById(id) {
  return get('SELECT * FROM tarjetas WHERE id = ?', [id]);
}

async function findByIdSafe(id) {
  return get(`SELECT ${COLUMNA_SAFE} FROM tarjetas WHERE id = ?`, [id]);
}

/**
 * Login por email. Si el email existe en varios comercios hay que
 * indicar comercioId para desambiguar.
 *
 * v1.7: con `sistema` se busca la tarjeta de UN sistema concreto
 * ('google' | 'apple'); el mismo email puede tener una tarjeta por
 * sistema (son independientes). Sin `sistema` (login antiguo) se
 * devuelve la primera fila que encaje.
 */
async function findByEmail(email, comercioId = null, sistema = null) {
  if (comercioId && sistema) {
    return get('SELECT * FROM tarjetas WHERE email = ? AND comercioId = ? AND sistema = ?', [
      email,
      comercioId,
      sistema,
    ]);
  }
  if (comercioId) {
    return get('SELECT * FROM tarjetas WHERE email = ? AND comercioId = ?', [
      email,
      comercioId,
    ]);
  }
  const filas = await query('SELECT * FROM tarjetas WHERE email = ?', [email]);
  if (filas.length > 1) {
    // AppError (no Error pelado): el errorHandler sólo honra AppError,
    // si no, esta ambigüedad caería a 500 INTERNAL en vez de 409.
    throw conflict(
      'El email está asociado a varios comercios: indica comercioId (idRandomLargo del comercio)',
      'EMAIL_AMBIGUO'
    );
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
    `INSERT INTO tarjetas (comercioId, nombre, email, puntos, premios, passwordHash, activo, sistema)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      datos.comercioId,
      datos.nombre,
      datos.email,
      datos.puntos ?? 0,
      datos.premios ?? 0,
      datos.passwordHash,
      datos.activo === false ? 0 : 1,
      datos.sistema ?? 'google',
    ]
  );
  return findById(result.insertId);
}

/**
 * Guarda el id del OBJETO de Google Wallet generado para esta tarjeta.
 * Sólo se usa al registrar (o cuando se llegue a crear el objeto).
 */
async function guardarObjetoGoogleWallet(id, objetoId) {
  await execute('UPDATE tarjetas SET googleWalletObjetoId = ? WHERE id = ?', [
    objetoId,
    id,
  ]);
  return findByIdSafe(id);
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
  guardarObjetoGoogleWallet,
};
