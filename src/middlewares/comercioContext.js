// =====================================================================
//  Contexto del comercio en las rutas protegidas
//
//  - Si el token es de comercio => ese mismo comercio (id del token).
//  - Si el token es de admin (permitido en todas las rutas de comercio)
//    => debe indicar explícitamente qué comercio (comercioId).
//
//  Además se exige que el comercio esté ACTIVO (activo = true).
// =====================================================================
const dbComercios = require('../db/comercios');
const { badRequest, forbidden, notFound } = require('../utils/errors');

async function resolverComercio(req, res, next) {
  try {
    let comercioId = null;

    if (req.user.role === 'comercio') {
      comercioId = req.user.sub;
    } else if (req.user.role === 'admin') {
      comercioId = req.body?.comercioId ?? req.query?.comercioId ?? null;
      if (!comercioId) {
        throw badRequest('El admin debe indicar comercioId para operar sobre un comercio', 'COMERCIO_REQUERIDO');
      }
    }

    const comercio = await dbComercios.findById(comercioId);
    if (!comercio) throw notFound('Comercio no encontrado', 'COMERCIO_NOT_FOUND');

    req.comercio = comercio;
    return next();
  } catch (err) {
    return next(err);
  }
}

/** Bloquea el acceso si el comercio no está activo. */
function exigirComercioActivo(req, res, next) {
  if (!req.comercio || Number(req.comercio.activo) !== 1) {
    return next(forbidden('El comercio está inactivo', 'COMERCIO_INACTIVO'));
  }
  return next();
}

module.exports = { resolverComercio, exigirComercioActivo };
