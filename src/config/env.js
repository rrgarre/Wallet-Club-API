// =====================================================================
//  Carga y validación de variables de entorno (.env)
// =====================================================================
require('dotenv').config();

function num(valor, porDefecto) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : porDefecto;
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: num(process.env.PORT, 3000),

  // JWT
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',

  // Contraseñas
  minPasswordAdmin: num(process.env.MIN_PASSWORD_ADMIN, 8),
  minPasswordCliente: num(process.env.MIN_PASSWORD_CLIENTE, 6),

  // Reglas de negocio
  camareroCodigos: (process.env.CAMARERO_CODIGOS || '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean),
  exigirNombreServidor: /^(1|true|yes|si|sí)$/i.test(
    String(process.env.EXIGIR_NOMBRE_SERVIDOR ?? 'true').trim()
  ),
  umbralPuntosNombre: num(process.env.UMBRAL_PUNTOS_NOMBRE, 100),
};

function validarEnv() {
  if (!env.jwtSecret) {
    throw new Error('Falta JWT_SECRET en el fichero .env');
  }
  if (env.jwtSecret === 'cambia-este-secreto-por-uno-largo-y-aleatorio' && env.nodeEnv === 'production') {
    throw new Error('JWT_SECRET sigue siendo el valor por defecto: cámbialo en .env');
  }
}

module.exports = { env, validarEnv };
