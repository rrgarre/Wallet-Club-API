// =====================================================================
//  Controllers: autenticación y registro público
// =====================================================================
const dbAdmins = require('../db/admin');
const dbComercios = require('../db/comercios');
const dbTarjetas = require('../db/tarjetas');
const googleWallet = require('../services/googleWalletService');
const { firmarToken } = require('../middlewares/auth');
const { hashPassword, verifyPassword } = require('../utils/hash');
const { unauthorized, forbidden, badRequest } = require('../utils/errors');
const { texto, email: vEmail, password: vPassword } = require('../utils/validate');
const { env } = require('../config/env');

/** POST /api/auth/admin/login  { nombre, password } */
async function loginAdmin(req, res, next) {
  try {
    const nombre = texto(req.body.nombre, 'nombre');
    const pass = vPassword(req.body.password, 'password', 1);

    const admin = await dbAdmins.findByNombre(nombre);
    if (!admin || !(await verifyPassword(pass, admin.passwordHash))) {
      throw unauthorized('Credenciales incorrectas', 'BAD_CREDENTIALS');
    }

    const token = firmarToken({ sub: admin.id, role: 'admin', nombre: admin.nombre });
    res.json({ ok: true, token, role: 'admin', usuario: { id: admin.id, nombre: admin.nombre } });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/comercio/login  { password, idRandomLargo | nombre }
 * El idRandomLargo sólo LOCALIZA al comercio: sin la password no hay token.
 */
async function loginComercio(req, res, next) {
  try {
    const pass = vPassword(req.body.password, 'password', 1);
    const { idRandomLargo, nombre } = req.body;

    const comercio = idRandomLargo
      ? await dbComercios.findByIdRandomLargo(texto(idRandomLargo, 'idRandomLargo', { max: 64 }))
      : await dbComercios.findByNombre(texto(nombre, 'nombre'));

    if (!comercio || !(await verifyPassword(pass, comercio.passwordHash))) {
      throw unauthorized('Credenciales incorrectas', 'BAD_CREDENTIALS');
    }
    if (Number(comercio.activo) !== 1) {
      throw forbidden('El comercio está inactivo', 'COMERCIO_INACTIVO');
    }

    const token = firmarToken({ sub: comercio.id, role: 'comercio', nombre: comercio.nombre });
    res.json({
      ok: true,
      token,
      role: 'comercio',
      usuario: {
        id: comercio.id,
        nombre: comercio.nombre,
        puntosPremio: comercio.puntosPremio,
        premioDescripcion: comercio.premioDescripcion,
        idRandomLargo: comercio.idRandomLargo,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/tarjeta/login  { email, password, comercioId? }
 * comercioId (id del comercio o su idRandomLargo) sólo hace falta si el
 * email está repetido en varios comercios.
 */
async function loginTarjeta(req, res, next) {
  try {
    const vEmailInput = vEmail(req.body.email);
    const pass = vPassword(req.body.password, 'password', 1);

    let comercioId = req.body.comercioId ?? null;
    if (comercioId && !Number.isInteger(Number(comercioId))) {
      const c = await dbComercios.findByIdRandomLargo(String(comercioId));
      if (!c) throw badRequest('comercioId no es válido', 'COMERCIO_NOT_FOUND');
      comercioId = c.id;
    }

    const tarjeta = await dbTarjetas.findByEmail(vEmailInput, comercioId);
    if (!tarjeta || !(await verifyPassword(pass, tarjeta.passwordHash))) {
      throw unauthorized('Credenciales incorrectas', 'BAD_CREDENTIALS');
    }
    if (Number(tarjeta.activo) !== 1) {
      throw forbidden('La tarjeta está inactiva', 'TARJETA_INACTIVA');
    }

    const token = firmarToken({ sub: tarjeta.id, role: 'tarjeta', nombre: tarjeta.nombre });
    res.json({
      ok: true,
      token,
      role: 'tarjeta',
      usuario: {
        id: tarjeta.id,
        nombre: tarjeta.nombre,
        email: tarjeta.email,
        comercioId: tarjeta.comercioId,
        puntos: tarjeta.puntos,
        premios: tarjeta.premios,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/registro/tarjeta/:idRandomLargo   { nombre, email, password }
 *
 * El idRandomLargo sólo IDENTIFICA el comercio destino en esta ruta
 * pública: no da acceso a nada privado del comercio. La comercioId se
 * deduce aquí, en el controller.
 */
async function registroTarjeta(req, res, next) {
  try {
    const idRandomLargo = texto(req.params.idRandomLargo, 'idRandomLargo', { max: 64 });

    // 1) ¿Existe ese comercio? (búsqueda exclusiva por idRandomLargo)
    const comercio = await dbComercios.findByIdRandomLargo(idRandomLargo);
    if (!comercio) {
      throw badRequest('Comercio no encontrado', 'COMERCIO_NOT_FOUND');
    }
    if (Number(comercio.activo) !== 1) {
      throw forbidden('Este comercio no admite registros', 'COMERCIO_INACTIVO');
    }

    // 2) Datos del cliente
    const nombre = texto(req.body.nombre, 'nombre', { max: 150 });
    const vEmailInput = vEmail(req.body.email);
    const pass = vPassword(req.body.password, 'password', env.minPasswordCliente);

    // 3) Email ya registrado en este comercio
    const existente = await dbTarjetas.findByEmail(vEmailInput, comercio.id);
    if (existente) {
      throw badRequest('Ya existe una tarjeta con ese email en este comercio', 'EMAIL_DUPLICADO');
    }

    // 4) Alta: la comercioId DEDUCIDA por el controller
    const passwordHash = await hashPassword(pass);
    const tarjeta = await dbTarjetas.create({
      comercioId: comercio.id, // <-- deducido del idRandomLargo
      nombre,
      email: vEmailInput,
      passwordHash,
      puntos: 0,
      premios: 0,
      activo: true,
    });

    const token = firmarToken({ sub: tarjeta.id, role: 'tarjeta', nombre: tarjeta.nombre });

    // ------------------------------------------------------------------
    // Google Wallet: si el comercio YA tiene clase creada (y no está en
    // DRAFT), generamos el enlace "Añadir a Google Wallet" de ESTA
    // tarjeta. Si no la tiene: alta igual y googleWalletUrl = null.
    // La creación del enlace es local (firma un JWT): no llama a Google.
    // ------------------------------------------------------------------
    let googleWalletUrl = null;
    if (
      comercio.googleWalletClaseId &&
      googleWallet.claseAdmiteTarjetas(comercio.googleWalletClaseEstado)
    ) {
      try {
        const enlace = googleWallet.generarEnlaceTarjeta({
          claseId: comercio.googleWalletClaseId, // id de la clase en Google
          tarjeta,                                // {id, nombre, puntos, premios...}
          comercio,                               // {idRandomLargo, nombre...}
        });
        googleWalletUrl = enlace.url;
        await dbTarjetas.guardarObjetoGoogleWallet(tarjeta.id, enlace.objectId);
        tarjeta.googleWalletObjetoId = enlace.objectId;
      } catch (err) {
        // Nunca hacemos fallar el alta por un problema de Google Wallet.
        console.error('[google-wallet] no se pudo generar el enlace:', err.message);
      }
    }

    res.status(201).json({
      ok: true,
      token,
      role: 'tarjeta',
      usuario: {
        id: tarjeta.id,
        nombre: tarjeta.nombre,
        email: tarjeta.email,
        comercioId: tarjeta.comercioId,
        puntos: tarjeta.puntos,
        premios: tarjeta.premios,
        googleWalletObjetoId: tarjeta.googleWalletObjetoId ?? null,
      },
      comercio: { id: comercio.id, nombre: comercio.nombre },
      googleWalletUrl,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { loginAdmin, loginComercio, loginTarjeta, registroTarjeta };
