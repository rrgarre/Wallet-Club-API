// =====================================================================
//  Acceso a datos: comercios
// =====================================================================
const crypto = require('crypto');
const { get, query, execute } = require('./connection');

const COLUMNA_SAFE =
  'id, nombre, nombreUsuario, puntosPremio, premioDescripcion, activo, idRandomLargo, createdAt, updatedAt, ' +
  'googleWalletClaseId, googleWalletClaseEstado, googleWalletClaseCreadaEn';

/** idRandomLargo: 48 caracteres hex (difícil de adivinar, pero NO es autenticación). */
function generarIdRandomLargo() {
  return crypto.randomBytes(24).toString('hex');
}

async function findById(id) {
  return get('SELECT * FROM comercios WHERE id = ?', [id]);
}

async function findByIdSafe(id) {
  return get(`SELECT ${COLUMNA_SAFE} FROM comercios WHERE id = ?`, [id]);
}

async function findByIdRandomLargo(idRandomLargo) {
  return get('SELECT * FROM comercios WHERE idRandomLargo = ?', [idRandomLargo]);
}

async function findByNombre(nombre) {
  return get('SELECT * FROM comercios WHERE nombre = ?', [nombre]);
}

/**
 * Login (v1.8): el comercio se identifica por SU nombre de usuario
 * (único global, en minúsculas). NULL = comercio heredado aún sin
 * rellenar desde admin: no puede iniciar sesión.
 */
async function findByNombreUsuario(nombreUsuario) {
  return get('SELECT * FROM comercios WHERE nombreUsuario = ?', [nombreUsuario]);
}

async function list() {
  return query(`SELECT ${COLUMNA_SAFE} FROM comercios ORDER BY nombre`);
}

/**
 * @param {{nombre, nombreUsuario, puntosPremio, premioDescripcion, activo,
 *          passwordHash, operarioHash}} datos
 */
async function create(datos) {
  const idRandomLargo = generarIdRandomLargo();
  const result = await execute(
    `INSERT INTO comercios (nombre, nombreUsuario, puntosPremio, premioDescripcion, activo, idRandomLargo, passwordHash, operarioHash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      datos.nombre,
      datos.nombreUsuario ?? null,
      datos.puntosPremio,
      datos.premioDescripcion ?? null,
      datos.activo ? 1 : 0,
      idRandomLargo,
      datos.passwordHash,
      datos.operarioHash ?? null,
    ]
  );
  return findById(result.insertId);
}

/**
 * Actualización parcial. Sólo se tocan los campos enviados.
 * @param {number} id
 * @param {{nombre?, nombreUsuario?, puntosPremio?, premioDescripcion?, activo?,
 *          passwordHash?, operarioHash?}} campos
 */
async function update(id, campos) {
  const sets = [];
  const params = [];

  if (campos.nombre !== undefined) {
    sets.push('nombre = ?');
    params.push(campos.nombre);
  }
  if (campos.nombreUsuario !== undefined) {
    sets.push('nombreUsuario = ?');
    params.push(campos.nombreUsuario);
  }
  if (campos.puntosPremio !== undefined) {
    sets.push('puntosPremio = ?');
    params.push(campos.puntosPremio);
  }
  if (campos.premioDescripcion !== undefined) {
    sets.push('premioDescripcion = ?');
    params.push(campos.premioDescripcion);
  }
  if (campos.activo !== undefined) {
    sets.push('activo = ?');
    params.push(campos.activo ? 1 : 0);
  }
  if (campos.passwordHash !== undefined) {
    sets.push('passwordHash = ?');
    params.push(campos.passwordHash);
  }
  if (campos.operarioHash !== undefined) {
    sets.push('operarioHash = ?');
    params.push(campos.operarioHash);
  }

  if (!sets.length) return findById(id);

  params.push(id);
  await execute(`UPDATE comercios SET ${sets.join(', ')} WHERE id = ?`, params);
  return findById(id);
}

/**
 * Guarda la CLASE de Google Wallet creada para este comercio.
 * (Sólo el id y el estado: la clase vive en Google, aquí sólo se recuerda
 *  a qué apuntarán las futuras tarjetas/objetos.)
 * @param {number} id comercio.id
 * @param {string} claseId  ej. 333333333333333.<idRandomLargo>
 * @param {string|null} estado DRAFT | UNDER_REVIEW | ...
 */
async function guardarClaseGoogleWallet(id, claseId, estado = null) {
  // googleWalletClaseCreadaEn se rellena SÓLO la primera vez (se conserva).
  await execute(
    'UPDATE comercios SET googleWalletClaseId = ?, googleWalletClaseEstado = ?, ' +
      'googleWalletClaseCreadaEn = COALESCE(googleWalletClaseCreadaEn, CURRENT_TIMESTAMP) WHERE id = ?',
    [claseId, estado, id]
  );
  return findByIdSafe(id);
}

module.exports = {
  generarIdRandomLargo,
  findById,
  findByIdSafe,
  findByIdRandomLargo,
  findByNombre,
  findByNombreUsuario,
  list,
  create,
  update,
  guardarClaseGoogleWallet,
};
