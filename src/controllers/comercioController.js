// =====================================================================
//  Controller: comercio (token de rol 'comercio' u 'operario', o admin
//  con comercioId). Todas las rutas exigen comercio.activo = true
//  (middleware). Las rutas que el operario NO alcanza se estrechan en
//  comercio.routes.js.
// =====================================================================
const dbTarjetas = require('../db/tarjetas');
const dbComercios = require('../db/comercios');
const { hashPassword, verifyPassword } = require('../utils/hash');
const { aplicarMovimiento } = require('../services/movimientoService');
const { notFound, badRequest, unauthorized } = require('../utils/errors');
const { entero, texto, password: vPassword } = require('../utils/validate');
const { env } = require('../config/env');

/** GET /api/comercio/perfil */
async function perfil(req, res, next) {
  try {
    const {
      id,
      nombre,
      nombreUsuario,
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
        nombreUsuario,
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

/**
 * PATCH /api/comercio/password   { passwordActual, passwordNueva }
 *
 * El comercio cambia SU propia contraseña (sólo token de rol 'comercio';
 * el admin no puede usar esta ruta — para restablecer la contraseña de un
 * comercio desde fuera, el admin usa PATCH /api/admin/comercios/:id).
 *
 * - `passwordActual` tiene que coincidir con la actual → si no, 401.
 * - `passwordNueva` respeta MIN_PASSWORD_ADMIN (igual que al crear el
 *   comercio). No hay límite de intentos más allá del token: sin token
 *   válido no se llega aquí.
 */
async function cambiarPassword(req, res, next) {
  try {
    const actual = texto(req.body.passwordActual, 'passwordActual', { max: 200 });
    const nueva = vPassword(req.body.passwordNueva, 'passwordNueva', env.minPasswordAdmin);

    if (!(await verifyPassword(actual, req.comercio.passwordHash))) {
      throw unauthorized('La contraseña actual no es correcta', 'PASSWORD_ACTUAL_INCORRECTA');
    }

    await dbComercios.update(req.comercio.id, { passwordHash: await hashPassword(nueva) });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { perfil, listarTarjetas, obtenerTarjeta, movimiento, cambiarPassword };
