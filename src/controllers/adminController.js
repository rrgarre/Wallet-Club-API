// =====================================================================
//  Controller: administrador
// =====================================================================
const dbComercios = require('../db/comercios');
const dbTarjetas = require('../db/tarjetas');
const dbOperaciones = require('../db/operaciones');
const { hashPassword } = require('../utils/hash');
const { notFound, badRequest } = require('../utils/errors');
const { texto, positivo, idParam } = require('../utils/validate');
const { env } = require('../config/env');

// ------------------------- COMERCIOS ---------------------------------

/** GET /api/admin/comercios */
async function listarComercios(req, res, next) {
  try {
    const filas = await dbComercios.list();
    res.json({ ok: true, total: filas.length, comercios: filas });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/comercios/:id */
async function obtenerComercio(req, res, next) {
  try {
    const id = idParam(req.params.id);
    const comercio = await dbComercios.findByIdSafe(id);
    if (!comercio) throw notFound('Comercio no encontrado', 'COMERCIO_NOT_FOUND');
    res.json({ ok: true, comercio });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/comercios
 * Body: { nombre, password, puntosPremio, premioDescripcion?, activo? }
 * Genera el idRandomLargo (identificador NO autenticante).
 */
async function crearComercio(req, res, next) {
  try {
    const nombre = texto(req.body.nombre, 'nombre', { max: 150 });
    const password = texto(req.body.password, 'password', { max: 200 });
    if (password.length < env.minPasswordAdmin) {
      throw badRequest(`La contraseña debe tener al menos ${env.minPasswordAdmin} caracteres`, 'VALIDATION');
    }
    const puntosPremio = positivo(req.body.puntosPremio ?? 10, 'puntosPremio');

    const duplicado = await dbComercios.findByNombre(nombre);
    if (duplicado) throw badRequest('Ya existe un comercio con ese nombre', 'COMERCIO_DUPLICADO');

    const comercio = await dbComercios.create({
      nombre,
      puntosPremio,
      premioDescripcion: req.body.premioDescripcion
        ? texto(req.body.premioDescripcion, 'premioDescripcion', { max: 255 })
        : null,
      activo: req.body.activo === undefined ? true : Boolean(req.body.activo),
      passwordHash: await hashPassword(password),
    });

    const { passwordHash, ...safe } = comercio;
    res.status(201).json({ ok: true, comercio: safe });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/admin/comercios/:id
 * Body parcial: { nombre?, password?, puntosPremio?, premioDescripcion?, activo? }
 */
async function editarComercio(req, res, next) {
  try {
    const id = idParam(req.params.id);
    const existente = await dbComercios.findById(id);
    if (!existente) throw notFound('Comercio no encontrado', 'COMERCIO_NOT_FOUND');

    const campos = {};
    if (req.body.nombre !== undefined) campos.nombre = texto(req.body.nombre, 'nombre', { max: 150 });
    if (req.body.puntosPremio !== undefined) campos.puntosPremio = positivo(req.body.puntosPremio, 'puntosPremio');
    if (req.body.premioDescripcion !== undefined) {
      campos.premioDescripcion = texto(req.body.premioDescripcion, 'premioDescripcion', {
        requerido: false,
        max: 255,
      });
    }
    if (req.body.activo !== undefined) campos.activo = Boolean(req.body.activo);
    if (req.body.password !== undefined) {
      const password = texto(req.body.password, 'password', { max: 200 });
      if (password.length < env.minPasswordAdmin) {
        throw badRequest(
          `La contraseña debe tener al menos ${env.minPasswordAdmin} caracteres`,
          'VALIDATION'
        );
      }
      campos.passwordHash = await hashPassword(password);
    }

    if (!Object.keys(campos).length) {
      throw badRequest('No hay campos que actualizar', 'VALIDATION');
    }

    const comercio = await dbComercios.update(id, campos);
    const { passwordHash, ...safe } = comercio;
    res.json({ ok: true, comercio: safe });
  } catch (err) {
    next(err);
  }
}

// ------------------------- TARJETAS ----------------------------------

/** GET /api/admin/tarjetas?comercioId= */
async function listarTarjetas(req, res, next) {
  try {
    const filtros = {};
    if (req.query.comercioId) filtros.comercioId = idParam(req.query.comercioId, 'comercioId');
    const filas = await dbTarjetas.list(filtros);
    res.json({ ok: true, total: filas.length, tarjetas: filas });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/tarjetas/:id */
async function obtenerTarjeta(req, res, next) {
  try {
    const id = idParam(req.params.id);
    const tarjeta = await dbTarjetas.findByIdSafe(id);
    if (!tarjeta) throw notFound('Tarjeta no encontrada', 'TARJETA_NOT_FOUND');
    res.json({ ok: true, tarjeta });
  } catch (err) {
    next(err);
  }
}

// ------------------------- OPERACIONES -------------------------------

/**
 * GET /api/admin/operaciones
 * Query: ?comercioId=&tarjetaId=&tipo=&desde=&hasta=&pagina=&tamano=
 */
async function listarOperaciones(req, res, next) {
  try {
    const filtros = {
      comercioId: req.query.comercioId ? idParam(req.query.comercioId, 'comercioId') : null,
      tarjetaId: req.query.tarjetaId ? idParam(req.query.tarjetaId, 'tarjetaId') : null,
      tipo: req.query.tipo || null,
      desde: req.query.desde || null,
      hasta: req.query.hasta || null,
      pagina: req.query.pagina,
      tamano: req.query.tamano,
    };
    const resultado = await dbOperaciones.list(filtros);
    res.json({ ok: true, ...resultado });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listarComercios,
  obtenerComercio,
  crearComercio,
  editarComercio,
  listarTarjetas,
  obtenerTarjeta,
  listarOperaciones,
};
