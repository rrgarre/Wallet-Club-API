// =====================================================================
//  Acceso a datos: admins
// =====================================================================
const { get, query, execute } = require('./connection');

const COLUMNA_SAFE = 'id, nombre, createdAt';

async function findByNombre(nombre) {
  return get('SELECT * FROM admins WHERE nombre = ?', [nombre]);
}

async function findById(id) {
  return get(`SELECT ${COLUMNA_SAFE} FROM admins WHERE id = ?`, [id]);
}

async function list() {
  return query(`SELECT ${COLUMNA_SAFE} FROM admins ORDER BY id`);
}

/** Crea (o actualiza el hash) de un admin. Uso: script de inicialización. */
async function upsert(nombre, passwordHash) {
  const existente = await findByNombre(nombre);
  if (existente) {
    await execute('UPDATE admins SET passwordHash = ? WHERE id = ?', [passwordHash, existente.id]);
    return findById(existente.id);
  }
  const result = await execute('INSERT INTO admins (nombre, passwordHash) VALUES (?, ?)', [
    nombre,
    passwordHash,
  ]);
  return findById(result.insertId);
}

module.exports = { findByNombre, findById, list, upsert };
