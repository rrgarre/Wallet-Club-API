// =====================================================================
//  Validaciones de entrada ligeras (sin dependencias externas)
// =====================================================================
const { badRequest } = require('./errors');

/** Entero con signo (acepta número o string numérico). */
function entero(valor, campo, { requerido = true, defecto = 0 } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (requerido) throw badRequest(`El campo '${campo}' es obligatorio`, 'VALIDATION');
    return defecto;
  }
  const n = Number(valor);
  if (!Number.isInteger(n)) {
    throw badRequest(`El campo '${campo}' debe ser un número entero`, 'VALIDATION');
  }
  return n;
}

function texto(valor, campo, { requerido = true, min = 1, max = 255, defecto } = {}) {
  if (valor === undefined || valor === null || String(valor).trim() === '') {
    if (requerido) throw badRequest(`El campo '${campo}' es obligatorio`, 'VALIDATION');
    return defecto ?? null;
  }
  const limpio = String(valor).trim();
  if (limpio.length < min) {
    throw badRequest(`El campo '${campo}' debe tener al menos ${min} caracteres`, 'VALIDATION');
  }
  if (limpio.length > max) {
    throw badRequest(`El campo '${campo}' no puede superar ${max} caracteres`, 'VALIDATION');
  }
  return limpio;
}

function email(valor, campo = 'email') {
  const limpio = texto(valor, campo, { max: 190 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio)) {
    throw badRequest(`El campo '${campo}' no es un email válido`, 'VALIDATION');
  }
  return limpio;
}

function password(valor, campo = 'password', min = 6) {
  const limpio = texto(valor, campo, { max: 200 });
  if (limpio.length < min) {
    throw badRequest(`La contraseña debe tener al menos ${min} caracteres`, 'VALIDATION');
  }
  return limpio;
}

function positivo(valor, campo, { requerido = true, defecto } = {}) {
  const n = entero(valor, campo, { requerido, defecto });
  if (n <= 0) throw badRequest(`El campo '${campo}' debe ser mayor que 0`, 'VALIDATION');
  return n;
}

function idParam(valor, campo = 'id') {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) {
    throw badRequest(`'${campo}' no es un identificador válido`, 'VALIDATION');
  }
  return n;
}

module.exports = { entero, texto, email, password, positivo, idParam };
