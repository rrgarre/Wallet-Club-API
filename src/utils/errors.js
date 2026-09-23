// =====================================================================
//  Error de aplicación con código HTTP (400, 401, 403, 404, 409...)
// =====================================================================
class AppError extends Error {
  constructor(status, message, code = 'ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const badRequest = (msg, code = 'BAD_REQUEST') => new AppError(400, msg, code);
const unauthorized = (msg = 'No autenticado', code = 'UNAUTHORIZED') =>
  new AppError(401, msg, code);
const forbidden = (msg = 'Acceso denegado', code = 'FORBIDDEN') =>
  new AppError(403, msg, code);
const notFound = (msg = 'Recurso no encontrado', code = 'NOT_FOUND') =>
  new AppError(404, msg, code);
const conflict = (msg, code = 'CONFLICT') => new AppError(409, msg, code);

module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict };
