// =====================================================================
//  JWT + control de roles
//  Roles: 'admin' | 'comercio' | 'operario' | 'tarjeta'
//
//  El idRandomLargo del comercio NO se usa como credencial: el token
//  sólo se emite en los login (admin/comercio/tarjeta) con password.
// =====================================================================
const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { unauthorized, forbidden } = require('../utils/errors');

/** Firma un token. payload: { sub, role, nombre, ... } */
function firmarToken(payload) {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

/** Extrae el token de la cabecera Authorization: Bearer <token>. */
function extraerToken(req) {
  const header = req.headers.authorization || '';
  if (/^bearer\s+/i.test(header)) return header.replace(/^bearer\s+/i, '').trim();
  return null;
}

/** Valida el token y deja el payload en req.user. */
function requireAuth(req, res, next) {
  const token = extraerToken(req);
  if (!token) return next(unauthorized('Falta el token Bearer'));
  try {
    req.user = jwt.verify(token, env.jwtSecret);
    return next();
  } catch (e) {
    return next(unauthorized('Token inválido o caducado', 'INVALID_TOKEN'));
  }
}

/** Restringe el acceso a los roles indicados: requireRole('comercio','admin') */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(
        forbidden(`Requiere rol: ${roles.join(' o ')}. Rol actual: ${req.user.role}`, 'FORBIDDEN_ROLE')
      );
    }
    return next();
  };
}

module.exports = { firmarToken, extraerToken, requireAuth, requireRole };
