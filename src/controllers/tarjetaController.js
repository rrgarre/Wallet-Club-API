// =====================================================================
//  Controller: tarjeta / cliente (token de rol 'tarjeta')
//  Un admin también puede usarlo indicando ?tarjetaId=
// =====================================================================
const dbTarjetas = require('../db/tarjetas');
const dbOperaciones = require('../db/operaciones');
const { badRequest } = require('../utils/errors');

async function resolverTarjetaPropia(req) {
  if (req.user.role === 'tarjeta') {
    const tarjeta = await dbTarjetas.findByIdSafe(req.user.sub);
    if (!tarjeta) throw badRequest('Tarjeta no encontrada', 'TARJETA_NOT_FOUND');
    return tarjeta;
  }
  // admin permitido: debe indicar cuál
  const tarjetaId = req.query.tarjetaId;
  if (!tarjetaId) {
    throw badRequest('El admin debe indicar tarjetaId', 'TARJETA_REQUERIDA');
  }
  const tarjeta = await dbTarjetas.findByIdSafe(tarjetaId);
  if (!tarjeta) throw badRequest('Tarjeta no encontrada', 'TARJETA_NOT_FOUND');
  return tarjeta;
}

/** GET /api/tarjeta/perfil -> parámetros de la tarjeta (sin passwordHash). */
async function perfil(req, res, next) {
  try {
    const tarjeta = await resolverTarjetaPropia(req);
    res.json({ ok: true, tarjeta });
  } catch (err) {
    next(err);
  }
}

/** GET /api/tarjeta/operaciones?limite=100 -> historial propio. */
async function historial(req, res, next) {
  try {
    const tarjeta = await resolverTarjetaPropia(req);
    const filas = await dbOperaciones.listByTarjeta(tarjeta.id, req.query.limite);
    res.json({ ok: true, total: filas.length, operaciones: filas });
  } catch (err) {
    next(err);
  }
}

module.exports = { perfil, historial };
