// =====================================================================
//  Controller: comercio (token de rol 'comercio', o admin con comercioId)
//  Todas las rutas exigen comercio.activo = true (middleware).
// =====================================================================
const dbTarjetas = require('../db/tarjetas');
const { aplicarMovimiento } = require('../services/movimientoService');
const { notFound, badRequest } = require('../utils/errors');
const { entero, texto } = require('../utils/validate');

/** GET /api/comercio/perfil */
async function perfil(req, res, next) {
  try {
    const {
      id,
      nombre,
      puntosPremio,
      premioDescripcion,
      activo,
      idRandomLargo,
      createdAt,
      googleWalletClaseId,
      googleWalletClaseEstado,
    } = req.comercio;
    res.json({
      ok: true,
      comercio: {
        id,
        nombre,
        puntosPremio,
        premioDescripcion,
        activo,
        idRandomLargo,
        createdAt,
        googleWalletClaseId,
        googleWalletClaseEstado,
      },
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/comercio/tarjetas -> tarjetas del comercio */
async function listarTarjetas(req, res, next) {
  try {
    const filas = await dbTarjetas.listByComercio(req.comercio.id);
    res.json({ ok: true, total: filas.length, tarjetas: filas });
  } catch (err) {
    next(err);
  }
}

/** GET /api/comercio/tarjetas/:id -> sólo si pertenece al comercio logueado */
async function obtenerTarjeta(req, res, next) {
  try {
    const tarjetaId = Number(req.params.id);
    if (!Number.isInteger(tarjetaId) || tarjetaId <= 0) {
      throw badRequest('id de tarjeta no válido', 'VALIDATION');
    }
    // comercioId del TOKEN (o del admin): nunca se acepta del cliente.
    const tarjeta = await dbTarjetas.findByIdSafe(tarjetaId);
    if (!tarjeta || tarjeta.comercioId !== req.comercio.id) {
      throw notFound('Tarjeta no encontrada o no pertenece a este comercio', 'TARJETA_NOT_FOUND');
    }
    res.json({ ok: true, tarjeta });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/comercio/tarjetas/:id/movimiento
 * Body:
 *   puntosDelta   (entero con signo, obligatorio)
 *   premiosDelta  (entero con signo, obligatorio; 0 si no toca premios)
 *   tipo          (opcional: acumulacion|canje|correccion|ajuste)
 *   descripcion   (opcional)
 *   nombre, codigoCamarero (si la operación es "no estándar")
 *   idempotencia  (opcional; también acepta la cabecera Idempotency-Key)
 *
 * Idempotencia: repetir la MISMA idempotencia devuelve `duplicado: true`
 * sin aplicar el movimiento otra vez.
 */
async function movimiento(req, res, next) {
  try {
    const tarjetaId = Number(req.params.id);
    if (!Number.isInteger(tarjetaId) || tarjetaId <= 0) {
      throw badRequest('id de tarjeta no válido', 'VALIDATION');
    }

    const puntosDelta = entero(req.body.puntosDelta, 'puntosDelta');
    const premiosDelta = entero(req.body.premiosDelta, 'premiosDelta');

    const idempotencia =
      (req.body.idempotencia && String(req.body.idempotencia).trim()) ||
      (req.headers['idempotency-key'] && String(req.headers['idempotency-key']).trim()) ||
      null;

    if (idempotencia && idempotencia.length > 64) {
      throw badRequest('idempotencia no puede superar 64 caracteres', 'VALIDATION');
    }

    const resultado = await aplicarMovimiento({
      comercioId: req.comercio.id, // dueño real de la tarjeta (del token)
      tarjetaId,
      puntosPremio: req.comercio.puntosPremio,
      puntosDelta,
      premiosDelta,
      tipo: req.body.tipo,
      descripcion: req.body.descripcion ? texto(req.body.descripcion, 'descripcion', { max: 255 }) : null,
      nombre: req.body.nombre,
      codigoCamarero: req.body.codigoCamarero,
      idempotencia,
    });

    res.status(resultado.duplicado ? 200 : 201).json(resultado);
  } catch (err) {
    next(err);
  }
}

module.exports = { perfil, listarTarjetas, obtenerTarjeta, movimiento };
