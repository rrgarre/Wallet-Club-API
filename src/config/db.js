// =====================================================================
//  ZONA DE CREDENCIALES DE BASE DE DATOS
// ---------------------------------------------------------------------
//  ÚNICO fichero de la API que toca las credenciales. Todo lo demás
//  importa el pool desde aquí (o desde src/db/*).
//
//  Los valores NO se escriben aquí: se leen del fichero .env
//  (ver .env.example para la plantilla).
// =====================================================================

const mysql = require('mysql2/promise');

/** Convierte "true"/"1"/"yes" (case-insensitive) a booleano. */
function toBool(valor, porDefecto = false) {
  if (valor === undefined || valor === null || valor === '') return porDefecto;
  return /^(1|true|yes|si|sí)$/i.test(String(valor).trim());
}

// ---------------------------------------------------------------------------
//  CREDENCIALES (desde .env)
// ---------------------------------------------------------------------------
const credenciales = {
  host: process.env.DB_HOST || '',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || '',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || '',
  charset: 'utf8mb4',
  // Conexión cifrada hacia la BD remota
  ssl: toBool(process.env.DB_SSL, false) ? {} : undefined,
  // Pool
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_LIMIT || 10),
  queueLimit: 0,
  enableKeepAlive: true,
  multipleStatements: false,
};

/**
 * Lanza un error claro si faltan credenciales obligatorias.
 * Se llama al arrancar la aplicación.
 */
function validarCredenciales() {
  const faltan = [];
  if (!credenciales.host) faltan.push('DB_HOST');
  if (!credenciales.user) faltan.push('DB_USER');
  if (!credenciales.database) faltan.push('DB_NAME');
  if (faltan.length) {
    throw new Error(
      `Faltan credenciales de base de datos en .env: ${faltan.join(', ')}`
    );
  }
}

// ---------------------------------------------------------------------------
//  POOL de conexiones (una sola instancia para toda la API)
// ---------------------------------------------------------------------------
const pool = mysql.createPool(credenciales);

/** Comprueba la conexión remota (SELECT 1). */
async function ping() {
  const [rows] = await pool.query('SELECT 1 AS ok');
  return rows[0].ok === 1;
}

async function cerrarPool() {
  await pool.end();
}

module.exports = { credenciales, validarCredenciales, pool, ping, cerrarPool };
