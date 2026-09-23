// =====================================================================
//  Manejo centralizado de errores + 404
// =====================================================================
const { AppError } = require('../utils/errors');

function notFoundHandler(req, res) {
  res.status(404).json({
    ok: false,
    error: { message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`, code: 'ROUTE_NOT_FOUND' },
  });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Errores de negocio / validación controlados
  if (err instanceof AppError) {
    return res.status(err.status).json({
      ok: false,
      error: { message: err.message, code: err.code },
    });
  }

  // Clave duplicada de MySQL (carrera en la idempotencia, email repetido...)
  if (err && err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      ok: false,
      error: { message: 'Registro duplicado (posible reintento)', code: 'DUPLICATE' },
    });
  }

  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({
      ok: false,
      error: { message: 'JSON inválido en el cuerpo de la petición', code: 'BAD_JSON' },
    });
  }

  console.error('[ERROR]', err);
  return res.status(500).json({
    ok: false,
    error: { message: 'Error interno del servidor', code: 'INTERNAL' },
  });
}

module.exports = { notFoundHandler, errorHandler };
