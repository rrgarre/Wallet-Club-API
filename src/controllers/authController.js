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
 * POST /api/auth/comercio/login  { password, idRandomLargo }
 * Sólo se acepta idRandomLargo + password (el login por `nombre` se
 * eliminó): el idRandomLargo sólo LOCALIZA al comercio, sin la password
 * no hay token.
 */
async function loginComercio(req, res, next) {
  try {
    const pass = vPassword(req.body.password, 'password', 1);
    const idRandomLargo = texto(req.body.idRandomLargo, 'idRandomLargo', { max: 64 });

    const comercio = await dbComercios.findByIdRandomLargo(idRandomLargo);

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
 * Enlace «Añadir a Google Wallet» REGENERADO para una tarjeta existente.
 *
 * - Se firma localmente (JWT RS256): NO llama a Google y se puede emitir
 *   infinitas veces. El id del objeto es determinista, así que reemitir
 *   nunca crea una segunda tarjeta en Google (si ya está guardada, Google
 *   la actualiza con la misma).
 * - Devuelve `null` si el comercio no tiene clase creada o está en DRAFT
 *   (misma regla que el alta) o si falla la firma: NUNCA rompe login ni
 *   registro.
 * - Si la tarjeta no tenía `googleWalletObjetoId` persistido, lo repara.
 *
 * @param {object} tarjeta fila de la tarjeta (id, puntos, premios...)
 * @param {object} comercio fila del comercio
 * @returns {Promise<string|null>} URL de Google o null
 */
async function enlaceGoogleWallet(tarjeta, comercio) {
  try {
    if (
      !comercio?.googleWalletClaseId ||
      !googleWallet.claseAdmiteTarjetas(comercio.googleWalletClaseEstado)
    ) {
      return null;
    }
    const enlace = googleWallet.generarEnlaceTarjeta({
      claseId: comercio.googleWalletClaseId,
      tarjeta,
      comercio,
    });
    if (tarjeta.googleWalletObjetoId !== enlace.objectId) {
      await dbTarjetas.guardarObjetoGoogleWallet(tarjeta.id, enlace.objectId);
      tarjeta.googleWalletObjetoId = enlace.objectId;
    }
    return enlace.url;
  } catch (err) {
    // Nunca bloqueamos login/registro por un problema de Google Wallet.
    console.error('[google-wallet] no se pudo generar el enlace:', err.message);
    return null;
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

    // Google Wallet: enlace REGENERADO (misma lógica que en el alta) para
    // que el usuario pueda (re)guardar su tarjeta desde el login. Añadido
    // es a la respuesta: si el comercio no tiene clase aprobada => null.
    const comercio = await dbComercios.findById(tarjeta.comercioId);
    const googleWalletUrl = await enlaceGoogleWallet(tarjeta, comercio);

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
        googleWalletObjetoId: tarjeta.googleWalletObjetoId ?? null,
      },
      googleWalletUrl,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/registro/tarjeta/:idRandomLargo   { nombre, email }
 *
 * El idRandomLargo sólo IDENTIFICA el comercio destino en esta ruta
 * pública: no da acceso a nada privado del comercio. La comercioId se
 * deduce aquí, en el controller.
 *
 * La password NO viene del front: el servidor usa SIEMPRE la constante
 * del .env (`USUARIO_PASSWORD`). El alta de usuario queda "oculta": la
 * pantalla de tarjeta queda preparada, pero el usuario interactúa con
 * sus puntos a través de Google Wallet. Si el body trae `password`, se
 * IGNORA.
 *
 * La respuesta 201 NO lleva `token` ni `role`: el navegador que registra
 * NO queda logueado (login manual aparte, que sí sigue devolviendo token).
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
    // Contraseña FIJA del .env: NUNCA se toma la del front (si el body
    // trae `password`, se ignora). Ver USUARIO_PASSWORD en env.js.
    const pass = env.usuarioPassword;

    // 3) Email ya registrado en este comercio => ¿REANUDAR EL ALTA?
    //    Si la contraseña de la cuenta es la estándar (USUARIO_PASSWORD)
    //    es el MISMO usuario que reintenta (caso típico: no llegó a
    //    ejecutar el enlace de Google Wallet la primera vez). NO se crea
    //    fila nueva ni se tocan saldos: se reemite el enlace sobre la
    //    tarjeta existente y se devuelve la MISMA respuesta que un alta
    //    nueva (201, sin token).
    //    Si la cuenta tiene OTRA contraseña (heredada) => conflicto real.
    const existente = await dbTarjetas.findByEmail(vEmailInput, comercio.id);
    if (existente) {
      if (!(await verifyPassword(pass, existente.passwordHash))) {
        throw badRequest('Ya existe una tarjeta con ese email en este comercio', 'EMAIL_DUPLICADO');
      }
      if (Number(existente.activo) !== 1) {
        throw forbidden('La tarjeta está inactiva', 'TARJETA_INACTIVA');
      }
      // Ojo: se conservan el NOMBRE y los saldos originales de la fila;
      // los datos del formulario de este reintento se ignoran.
      // Igual que el alta: 201 SIN token (el navegador no queda logueado).
      const googleWalletUrl = await enlaceGoogleWallet(existente, comercio);
      return res.status(201).json({
        ok: true,
        usuario: {
          id: existente.id,
          nombre: existente.nombre,
          email: existente.email,
          comercioId: existente.comercioId,
          puntos: existente.puntos,
          premios: existente.premios,
          googleWalletObjetoId: existente.googleWalletObjetoId ?? null,
        },
        comercio: { id: comercio.id, nombre: comercio.nombre },
        googleWalletUrl,
      });
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

    // Google Wallet: si el comercio YA tiene clase creada (y no está en
    // DRAFT), generamos el enlace "Añadir a Google Wallet" de ESTA tarjeta;
    // si no: alta igual y googleWalletUrl = null. (Ver helper de arriba.)
    const googleWalletUrl = await enlaceGoogleWallet(tarjeta, comercio);

    // 201 SIN token: el navegador que registra NO queda logueado (ni
    // redirigido): si el usuario quiere entrar, lo hace a mano con el
    // login. El enlace de Wallet no es una credencial (sólo sirve para
    // guardarse la tarjeta en la Wallet de quien lo abre).
    res.status(201).json({
      ok: true,
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
