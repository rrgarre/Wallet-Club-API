// =====================================================================
//  Controller: administrador
// =====================================================================
const dbComercios = require('../db/comercios');
const dbTarjetas = require('../db/tarjetas');
const dbOperaciones = require('../db/operaciones');
const { hashPassword, verifyPassword } = require('../utils/hash');
const { notFound, badRequest } = require('../utils/errors');
const { texto, positivo, idParam, entero, nombreUsuario: vNombreUsuario } = require('../utils/validate');
const { env } = require('../config/env');

/** maximoPremios (v1.10): entero ≥ 0; 0 = sin límite de premios. */
function maximoPremiosValor(valor, campo = 'maximoPremios') {
  const n = entero(valor, campo, { requerido: false, defecto: 0 });
  if (n < 0) {
    throw badRequest(`El campo '${campo}' no puede ser negativo (0 = sin límite)`, 'VALIDATION');
  }
  return n;
}

/** El nombre de usuario es único global (el login ya no lleva idRandomLargo). */
async function exigirNombreUsuarioLibre(nombreUsuario, idExcluido = null) {
  const dup = await dbComercios.findByNombreUsuario(nombreUsuario);
  if (dup && dup.id !== idExcluido) {
    throw badRequest('Ya existe un comercio con ese nombre de usuario', 'USUARIO_DUPLICADO');
  }
}

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
 * Body: { nombre, nombreUsuario, password, operarioPassword,
 *         puntosPremio, premioDescripcion?, maximoPremios?, activo? }
 * Genera el idRandomLargo (identificador NO autenticante).
 * - `password` = contraseña del comercio (rol 'comercio').
 * - `operarioPassword` = contraseña de operario/camarero (rol 'operario').
 */
async function crearComercio(req, res, next) {
  try {
    const nombre = texto(req.body.nombre, 'nombre', { max: 150 });
    const nombreUsuario = vNombreUsuario(req.body.nombreUsuario);
    const password = texto(req.body.password, 'password', { max: 200 });
    if (password.length < env.minPasswordAdmin) {
      throw badRequest(`La contraseña debe tener al menos ${env.minPasswordAdmin} caracteres`, 'VALIDATION');
    }
    const operarioPassword = texto(req.body.operarioPassword, 'operarioPassword', { max: 200 });
    if (operarioPassword.length < env.minPasswordAdmin) {
      throw badRequest(
        `La contraseña de operario debe tener al menos ${env.minPasswordAdmin} caracteres`,
        'VALIDATION'
      );
    }
    if (password === operarioPassword) {
      throw badRequest(
        'La contraseña de comercio y la de operario no pueden ser iguales',
        'PASSWORDS_IGUALES'
      );
    }
    const maximoPremios = maximoPremiosValor(req.body.maximoPremios);
    const puntosPremio = positivo(req.body.puntosPremio ?? 10, 'puntosPremio');

    const duplicado = await dbComercios.findByNombre(nombre);
    if (duplicado) throw badRequest('Ya existe un comercio con ese nombre', 'COMERCIO_DUPLICADO');
    await exigirNombreUsuarioLibre(nombreUsuario);

    const comercio = await dbComercios.create({
      nombre,
      nombreUsuario,
      puntosPremio,
      premioDescripcion: req.body.premioDescripcion
        ? texto(req.body.premioDescripcion, 'premioDescripcion', { max: 255 })
        : null,
      maximoPremios,
      activo: req.body.activo === undefined ? true : Boolean(req.body.activo),
      passwordHash: await hashPassword(password),
      operarioHash: await hashPassword(operarioPassword),
    });

    const { passwordHash, operarioHash, ...safe } = comercio;
    res.status(201).json({ ok: true, comercio: safe });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/admin/comercios/:id
 * Body parcial: { nombre?, nombreUsuario?, password?, operarioPassword?,
 *                 puntosPremio?, premioDescripcion?, maximoPremios?, activo? }
 * Sirve también para rellenar los comercios heredados que quedaron sin
 * nombre de usuario ni contraseña de operario (NULL desde la migración).
 */
async function editarComercio(req, res, next) {
  try {
    const id = idParam(req.params.id);
    const existente = await dbComercios.findById(id);
    if (!existente) throw notFound('Comercio no encontrado', 'COMERCIO_NOT_FOUND');

    const campos = {};
    if (req.body.nombre !== undefined) campos.nombre = texto(req.body.nombre, 'nombre', { max: 150 });
    if (req.body.nombreUsuario !== undefined) campos.nombreUsuario = vNombreUsuario(req.body.nombreUsuario);
    if (req.body.puntosPremio !== undefined) campos.puntosPremio = positivo(req.body.puntosPremio, 'puntosPremio');
    if (req.body.maximoPremios !== undefined) campos.maximoPremios = maximoPremiosValor(req.body.maximoPremios);
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
    if (req.body.operarioPassword !== undefined) {
      const operarioPassword = texto(req.body.operarioPassword, 'operarioPassword', { max: 200 });
      if (operarioPassword.length < env.minPasswordAdmin) {
        throw badRequest(
          `La contraseña de operario debe tener al menos ${env.minPasswordAdmin} caracteres`,
          'VALIDATION'
        );
      }
      campos.operarioHash = await hashPassword(operarioPassword);
    }

    if (!Object.keys(campos).length) {
      throw badRequest('No hay campos que actualizar', 'VALIDATION');
    }
    if (campos.nombreUsuario !== undefined) {
      await exigirNombreUsuarioLibre(campos.nombreUsuario, id);
    }

    // v1.9: la contraseña de comercio y la de operario nunca pueden ser la
    // misma (el login prueba antes la de operario: si coinciden, el comercio
    // sólo entraría como 'operario' y perdería su panel).
    const igualdad =
      campos.passwordHash !== undefined && campos.operarioHash !== undefined
        ? req.body.password === req.body.operarioPassword // ambos nuevos: comparar textos
        : campos.passwordHash !== undefined
          ? Boolean(existente.operarioHash) && (await verifyPassword(req.body.password, existente.operarioHash))
          : campos.operarioHash !== undefined
            ? Boolean(existente.passwordHash) && (await verifyPassword(req.body.operarioPassword, existente.passwordHash))
            : false;
    if (igualdad) {
      throw badRequest(
        'La contraseña de comercio y la de operario no pueden ser iguales',
        'PASSWORDS_IGUALES'
      );
    }

    const comercio = await dbComercios.update(id, campos);
    const { passwordHash, operarioHash, ...safe } = comercio;
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
