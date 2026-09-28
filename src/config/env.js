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
  // Contraseña FIJA de las altas de tarjeta/usuario. El front NO la envía
  // en el registro: el servidor la usa siempre (el alta queda "oculta" y
  // el usuario interactúa con sus puntos vía Google Wallet). El login de
  // tarjeta (pantalla preparada) autentica con esta misma contraseña.
  usuarioPassword: (process.env.USUARIO_PASSWORD || '').trim(),

  // Reglas de negocio
  camareroCodigos: (process.env.CAMARERO_CODIGOS || '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean),
  exigirNombreServidor: /^(1|true|yes|si|sí)$/i.test(
    String(process.env.EXIGIR_NOMBRE_SERVIDOR ?? 'true').trim()
  ),
  umbralPuntosNombre: num(process.env.UMBRAL_PUNTOS_NOMBRE, 100),

  // Google Wallet (se validan al usar el endpoint, no al arrancar)
  googleWallet: {
    issuerId: process.env.GOOGLE_WALLET_ISSUER_ID || '',
    credenciales: process.env.GOOGLE_WALLET_CREDENTIALS || '',
  },

  // URL base del front. El QR de la tarjeta ya NO la incluye (el QR sólo
  // lleva el id de la tarjeta; el front arma la URL en su lector de QR).
  frontUrl: (process.env.FRONT_URL || '').replace(/\/+$/, ''),
};

function validarEnv() {
  if (!env.jwtSecret) {
    throw new Error('Falta JWT_SECRET en el fichero .env');
  }
  if (env.jwtSecret === 'cambia-este-secreto-por-uno-largo-y-aleatorio' && env.nodeEnv === 'production') {
    throw new Error('JWT_SECRET sigue siendo el valor por defecto: cámbialo en .env');
  }
  if (!env.usuarioPassword) {
    throw new Error('Falta USUARIO_PASSWORD en el fichero .env (contraseña fija de las altas de tarjeta)');
  }
  if (env.usuarioPassword.length < env.minPasswordCliente) {
    throw new Error(
      `USUARIO_PASSWORD debe tener al menos ${env.minPasswordCliente} caracteres (MIN_PASSWORD_CLIENTE)`
    );
  }
}

module.exports = { env, validarEnv };
