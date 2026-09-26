// =====================================================================
//  Servicio: Google Wallet — creación de CLASE de fidelización
// ---------------------------------------------------------------------
//  Una CLASE (loyaltyClass) es la plantilla/modelo del comercio (logo,
//  colores, textos). Se crea UNA SOLA VEZ por comercio; las futuras
//  tarjetas (objetos / instancias) apuntarán a ella.
//
//  Endpoints usados:
//    POST https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass
//    GET  https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass/{classId}
//
//  Autenticación: service account + flujo "JWT bearer" (RS256) para
//  canjear un assertion por un access_token de OAuth2.
//  Rol GCP requerido: "Wallet Object Issuer".
//  Referencia de campos:
//  https://developers.google.com/wallet/reference/rest/v1/loyaltyclass
// =====================================================================
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { AppError } = require('../utils/errors');

// Scope correcto de la API REST de Wallet: 'wallet_object.issuer'
// (sin '.issuer' Google devuelve un id_token inútil y la llamada da 401).
const SCOPE = 'https://www.googleapis.com/auth/wallet_object.issuer';

const URL_TOKEN = 'https://oauth2.googleapis.com/token';
const URL_CLASE = 'https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass';
const URL_OBJETO = 'https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject';

// Timeout de las llamadas a Google (para no bloquear al camarero):
// si Google no contesta en 10 s, se considera error de sincronización.
const TIMEOUT_GOOGLE_MS = 10000;

// ID de emisor de ejemplo genérico; el valor real vive en .env
// (GOOGLE_WALLET_ISSUER_ID) y de ahí se coge SIEMPRE. El CLASS_ID se
// construye como:  <issuerId>.<idRandomLargo del comercio>
// p.ej. 333333333333333.COMERCIO_2

let cacheToken = { token: null, expira: 0 };

// ------------------------- CONFIGURACIÓN -----------------------------
function configuracion() {
  const issuerId = (env.googleWallet.issuerId || '').trim();
  if (!issuerId) {
    throw new AppError(
      503,
      'Google Wallet no está configurado: falta GOOGLE_WALLET_ISSUER_ID en el fichero .env',
      'GOOGLE_WALLET_SIN_CONFIG'
    );
  }
  const rutaRel = (env.googleWallet.credenciales || '').trim();
  if (!rutaRel) {
    throw new AppError(
      503,
      'Google Wallet no está configurado: falta GOOGLE_WALLET_CREDENTIALS en el fichero .env',
      'GOOGLE_WALLET_SIN_CONFIG'
    );
  }
  const ruta = path.isAbsolute(rutaRel) ? rutaRel : path.join(__dirname, '..', '..', rutaRel);
  if (!fs.existsSync(ruta)) {
    throw new AppError(
      503,
      `Google Wallet no está configurado: no existe el fichero de credenciales (${rutaRel})`,
      'GOOGLE_WALLET_SIN_CONFIG'
    );
  }

  let credenciales;
  try {
    credenciales = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  } catch (_) {
    throw new AppError(
      503,
      'Google Wallet: el fichero de credenciales no es un JSON válido',
      'GOOGLE_WALLET_SIN_CONFIG'
    );
  }
  if (!credenciales.client_email || !credenciales.private_key) {
    throw new AppError(
      503,
      'Google Wallet: el fichero de credenciales no tiene client_email / private_key',
      'GOOGLE_WALLET_SIN_CONFIG'
    );
  }

  return { issuerId, credenciales };
}

/** ID de la clase de un comercio: <issuerId>.<idRandomLargo> */
function classIdDe(issuerId, idRandomLargo) {
  return `${issuerId}.${idRandomLargo}`;
}

// --------------------------- AUTH / TOKEN ----------------------------
//  1) Firma corta con la clave privada de la service account (RS256)
//  2) La canjea por un access_token en oauth2.googleapis.com/token
async function obtenerToken() {
  const ahora = Math.floor(Date.now() / 1000);

  if (cacheToken.token && cacheToken.expira > ahora + 60) {
    return cacheToken.token; // reutiliza el token mientras siga vivo
  }

  const { credenciales } = configuracion();

  const assertion = jwt.sign(
    {
      iss: credenciales.client_email,
      scope: SCOPE,
      aud: URL_TOKEN,
      iat: ahora,
      exp: ahora + 3600, // 1 hora
    },
    credenciales.private_key,
    { algorithm: 'RS256' }
  );

  let respuesta;
  try {
    respuesta = await fetch(URL_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:
        'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer' +
        `&assertion=${encodeURIComponent(assertion)}`,
    });
  } catch (err) {
    throw new AppError(
      502,
      `No se pudo contactar con Google (OAuth2): ${err.message}`,
      'GOOGLE_WALLET_INDISPONIBLE'
    );
  }

  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    throw new AppError(
      502,
      `Google rechazó la autenticación de la service account (${respuesta.status}): ${
        datos.error_description || datos.error || 'sin detalle'
      }`,
      'GOOGLE_WALLET_AUTH'
    );
  }

  cacheToken = { token: datos.access_token, expira: ahora + Number(datos.expires_in || 3600) };
  return cacheToken.token;
}

// --------------------------- CONSTRUCCIÓN ----------------------------
// Google exige sourceUri + contentDescription (texto alternativo)
const imagen = (uri, texto) => ({
  sourceUri: { uri },
  contentDescription: { defaultValue: { language: 'es-ES', value: texto } },
});

/**
 * Construye el body de la CLASE a partir de los datos del comercio
 * (BD) y los parámetros del endpoint.
 *
 * @param {object} p
 * @param {{nombre:string}} p.comercio
 * @param {string} p.idRandomLargo
 * @param {string} p.imgLogo   URL HTTPS del logo (obligatoria)
 * @param {string} [p.imgHero] URL HTTPS del banner
 * @param {string} [p.imgModulo] URL HTTPS de la foto de módulo
 * @param {string|null} [p.hexBackgroundColor] '#rgb' / '#rrggbb'
 *   Si NO se envía, el campo NO se incluye y Google usa el color
 *   dominante de la imagen hero (no es obligatorio: omitirlo no da error).
 * @param {string} p.terminosTexto  cuerpo del módulo de texto TÉRMINOS
 * @param {'DRAFT'|'UNDER_REVIEW'} p.reviewStatus
 */
function construirClase({ comercio, idRandomLargo, imgLogo, imgHero, imgModulo, hexBackgroundColor, terminosTexto, reviewStatus }) {
  const { issuerId } = configuracion();
  const nombre = comercio.nombre;

  const clase = {
    id: classIdDe(issuerId, idRandomLargo),

    // ---- Campos obligatorios ----
    issuerName: nombre,                      // nombre del comercio (ej. Bar Reinol)
    programName: `Fidelización ${nombre}`,   // "Fidelización " + nombre
    programLogo: imagen(imgLogo, `Logo de ${nombre}`),
    reviewStatus,                            // DRAFT | UNDER_REVIEW

    accountIdLabel: 'Usuario',               // ~15 caracteres
    accountNameLabel: 'Cliente',             // ~15 caracteres

    countryCode: 'ES',
    textModulesData: [
      { id: 'TERMINOS', header: 'Términos', body: terminosTexto },
    ],
  };

  // ---- Opcionales: sólo se incluyen si vienen de parámetro ----
  if (hexBackgroundColor) clase.hexBackgroundColor = hexBackgroundColor;
  if (imgHero) clase.heroImage = imagen(imgHero, `Banner de ${nombre}`);
  if (imgModulo) {
    clase.imageModulesData = [{ id: 'FOTO_COMERCIO', mainImage: imagen(imgModulo, `Foto de ${nombre}`) }];
  }

  // ---- Ejemplos de campos disponibles (descomentar si hace falta) ----
  // clase.homepageUri = { uri: 'https://example.com', description: 'Web del comercio' };
  //
  // clase.linksModuleData = {
  //   uris: [
  //     { id: 'WEB', uri: 'https://example.com', description: 'Web del comercio' },
  //     { id: 'SOPORTE', uri: 'mailto:soporte@example.com', description: 'Soporte' },
  //   ],
  // };
  //
  // clase.messages = [{ header: '¡Doble punto hoy!', body: '...', messageType: 'TEXT' }];
  // clase.notifyPreference = 'NOTIFY_ON_UPDATE';
  // clase.callbackOptions = { url: 'https://tu-api.com/wallet/callback' };

  return clase;
}

// --------------------------- MAPEO DE ERRORES ------------------------
function errorDeGoogle(status, datos) {
  const detalle =
    (Array.isArray(datos.error) && datos.error.map((e) => e.message).join('; ')) ||
    datos.error?.message ||
    (typeof datos.error === 'string' ? datos.error : null) ||
    JSON.stringify(datos);

  if (status === 400) {
    return new AppError(400, `Google rechazó los datos de la clase: ${detalle}`, 'GOOGLE_WALLET_400');
  }
  if (status === 401 || status === 403) {
    return new AppError(
      502,
      `Google denegó el acceso (¿la service account tiene el rol "Wallet Object Issuer"?): ${detalle}`,
      'GOOGLE_WALLET_PERMISOS'
    );
  }
  return new AppError(
    502,
    `Google Wallet devolvió un error (${status}): ${detalle}`,
    'GOOGLE_WALLET_INDISPONIBLE'
  );
}

// --------------------------- OPERACIONES -----------------------------

/**
 * POST loyaltyClass — crea la clase.
 * @returns {{creada:boolean, claseId:string, clase:object|null}}
 *   - creada:true  → Google la creó
 *   - creada:false → ya existía (HTTP 409 de Google); claseId informado
 */
async function crearClase(params) {
  const { issuerId } = configuracion();
  const clase = construirClase({ ...params, idRandomLargo: params.idRandomLargo });
  const token = await obtenerToken();

  let respuesta;
  try {
    respuesta = await fetch(URL_CLASE, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(clase),
    });
  } catch (err) {
    throw new AppError(
      502,
      `No se pudo contactar con Google Wallet: ${err.message}`,
      'GOOGLE_WALLET_INDISPONIBLE'
    );
  }

  const datos = await respuesta.json().catch(() => ({}));

  // Ya existía: no se sobrescribe con POST (habría que mandar un PATCH).
  if (respuesta.status === 409) {
    return { creada: false, claseId: clase.id, clase: null };
  }
  if (!respuesta.ok) throw errorDeGoogle(respuesta.status, datos);

  return { creada: true, claseId: clase.id, clase: datos };
}

/** GET loyaltyClass/{classId} — consulta una clase existente. */
async function obtenerClase(classId) {
  const token = await obtenerToken();
  let respuesta;
  try {
    respuesta = await fetch(`${URL_CLASE}/${encodeURIComponent(classId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    throw new AppError(
      502,
      `No se pudo contactar con Google Wallet: ${err.message}`,
      'GOOGLE_WALLET_INDISPONIBLE'
    );
  }

  const datos = await respuesta.json().catch(() => ({}));
  if (respuesta.status === 404) return null;
  if (!respuesta.ok) throw errorDeGoogle(respuesta.status, datos);
  return datos;
}

// =====================================================================
//  TARJETAS (objetos) — enlace "Añadir a Google Wallet"
// ---------------------------------------------------------------------
//  La CLASE ya existe (se creó con el endpoint de clase). Aquí sólo se
//  construye el OBJETO (tarjeta) concreto de un usuario y se firma un
//  JWT "savetowallet": Google crea la tarjeta cuando el usuario abre
//  el enlace y pulsa "Guardar".
//
//  ⚠ La URL no está vinculada a ninguna cuenta: quien la abra se la
//  guarda en SU Google Wallet. Devuélvela sólo al cliente del alta.
//
//  La clase debe estar en UNDER_REVIEW/APPROVED (una clase DRAFT no
//  admite tarjetas).
// =====================================================================

/**
 * Normaliza el id de la clase: acepta el id completo o sólo el sufijo.
 *   resolverClassId('COMERCIO_2')                     → '<issuerId>.COMERCIO_2'
 *   resolverClassId('<issuerId>.COMERCIO_2')          → '<issuerId>.COMERCIO_2'
 */
function resolverClassId(clase) {
  const { issuerId } = configuracion();
  if (!clase) {
    throw new AppError(
      503,
      'Este comercio todavía no tiene clase creada en Google Wallet',
      'GOOGLE_WALLET_SIN_CLASE'
    );
  }
  return String(clase).includes('.') ? String(clase) : `${issuerId}.${clase}`;
}

/**
 * Id único del objeto (tarjeta) en todo Google Wallet.
 * Caracteres permitidos: letras, números, '.', '_' o '-'.
 */
function objectIdDe(tarjetaId, idRandomLargo) {
  const { issuerId } = configuracion();
  return `${issuerId}.USER_${tarjetaId}_COMERCIO_${idRandomLargo}`;
}

/**
 * Contenido del QR (barcode) de cada tarjeta: SÓLO el identificador
 * numérico de la tarjeta (p. ej. "7").
 *
 * Motivo de seguridad: el QR NO expone la URL de captura de los
 * comercios; es el front quien, en su página exclusiva con lector de QR,
 * construye la URL real añadiendo la base + este identificador.
 */
function qrDeTarjeta(tarjetaId) {
  return String(tarjetaId);
}

/**
 * Construye el enlace "Añadir a Google Wallet" para una tarjeta NUEVA.
 * (Sólo firma un JWT local: no llama a Google; la tarjeta se materializa
 *  allí cuando el usuario abre el enlace.)
 *
 * @param {object} p
 * @param {string} p.claseId  id de la CLASE del comercio (comercios.googleWalletClaseId)
 * @param {object} p.tarjeta  fila de la tarjeta (id, nombre, puntos, premios...)
 * @param {object} p.comercio fila del comercio (idRandomLargo, nombre...)
 * @returns {{url:string, objectId:string, qr:string}}
 */
function generarEnlaceTarjeta({ claseId, tarjeta, comercio }) {
  const { credenciales } = configuracion();
  const classId = resolverClassId(claseId);
  const objectId = objectIdDe(tarjeta.id, comercio.idRandomLargo);
  const qr = qrDeTarjeta(tarjeta.id); // QR = sólo el id de la tarjeta

  const objeto = {
    // ---- Imprescindibles ----
    id: objectId,
    classId, // ← hereda logo, color y textos de la clase
    state: 'ACTIVE', // 'ACTIVE' | 'EXPIRED' | 'COMPLETED'

    // ---- Datos del usuario (nuestra BD) ----
    accountId: String(tarjeta.id), // id interno (máx. 20 caracteres; Google no lo verifica)
    accountName: tarjeta.nombre,   // nombre visible en la tarjeta

    // ---- Código de canje: QR con SÓLO el id (la URL la arma el front) ----
    barcode: { type: 'QR_CODE', value: qr },

    // ---- Contadores (lo que Google renderiza siempre) ----
    loyaltyPoints: { label: 'Puntos', balance: { int: tarjeta.puntos ?? 0 } },
    secondaryLoyaltyPoints: { label: 'Premios', balance: { int: tarjeta.premios ?? 0 } },

    // ---- Potenciales (descomentar cuando hagan falta) ----
    // heroImage: { sourceUri: { uri: 'https://...' }, contentDescription: {...} },
    // messages: [{ header: '¡Bienvenido!', body: '...', messageType: 'TEXT' }],
    // textModulesData: [{ id: 'TARJETA', header: 'Nº tarjeta', body: '0000-0001' }],
    // validTimeInterval: { start: { date: '...' }, end: { date: '...' } },
    // notifyPreference: 'NOTIFY_ON_UPDATE',   // avisos al PATCHear (se resetea en cada PATCH)
  };

  // JWT con SÓLO payload.loyaltyObjects (NO loyaltyClasses: la clase ya existe).
  const claims = {
    iss: credenciales.client_email,
    aud: 'google',
    typ: 'savetowallet',
    payload: { loyaltyObjects: [objeto] },
  };

  const token = jwt.sign(claims, credenciales.private_key, { algorithm: 'RS256' });
  return { url: `https://pay.google.com/gp/v/save/${token}`, objectId, qr };
}

/** ¿El estado guardado de la clase admite crear tarjetas? (DRAFT, no) */
function claseAdmiteTarjetas(estado) {
  if (!estado) return true; // sin dato: dejamos que Google decida
  return String(estado).trim().toLowerCase() !== 'draft';
}

// =====================================================================
//  ACTUALIZACIÓN DE SALDOS (siguiente fase) — PATCH loyaltyObject
// ---------------------------------------------------------------------
//  La tarjeta sólo existe en Google cuando el usuario ha abierto el
//  enlace y la ha guardado. A partir de ahí, cada cambio de puntos o
//  premios en nuestra BD se refleja con un PATCH de los dos contadores.
//
//  updateMask: sólo se tocan los contadores y el barcode. El barcode se
//  incluye para que las tarjetas YA guardadas en el Wallet converjan al
//  formato nuevo del QR (sólo el id de la tarjeta) en su próximo
//  movimiento; el resto de la tarjeta (classId, state...) queda intacto.
// =====================================================================

/**
 * PATCH loyaltyObject/{id} — sincroniza puntos, premios y QR con Google Wallet.
 *
 * @param {object} p
 * @param {string} p.objectId  tarjetas.googleWalletObjetoId
 * @param {number} p.puntos    saldo nuevo de puntos
 * @param {number} p.premios   saldo nuevo de premios
 * @param {number} [p.tarjetaId] si se pasa, también se actualiza el barcode
 *   al QR nuevo (sólo el id); útil para migrar tarjetas ya guardadas
 * @returns {Promise<'sincronizado'|'sin_objeto'>}
 *   - 'sincronizado' → Google confirmó (200)
 *   - 'sin_objeto'   → 404: el usuario todavía no ha guardado la tarjeta
 * Lanza AppError(502) para el resto (el llamante decide qué hacer).
 */
async function actualizarSaldos({ objectId, puntos, premios, tarjetaId }) {
  const token = await obtenerToken();

  const cuerpo = {
    loyaltyPoints: { label: 'Puntos', balance: { int: Number(puntos) || 0 } },
    secondaryLoyaltyPoints: { label: 'Premios', balance: { int: Number(premios) || 0 } },
  };
  const mascara = ['loyaltyPoints', 'secondaryLoyaltyPoints'];
  if (tarjetaId !== undefined && tarjetaId !== null) {
    cuerpo.barcode = { type: 'QR_CODE', value: qrDeTarjeta(tarjetaId) };
    mascara.push('barcode');
  }

  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), TIMEOUT_GOOGLE_MS);

  let respuesta;
  try {
    respuesta = await fetch(
      `${URL_OBJETO}/${encodeURIComponent(objectId)}?updateMask=${mascara.join(',')}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
        signal: control.signal,
      }
    );
  } catch (err) {
    throw new AppError(
      502,
      `Google Wallet no respondió al actualizar la tarjeta (${err.name}): ${err.message}`,
      'GOOGLE_WALLET_INDISPONIBLE'
    );
  } finally {
    clearTimeout(reloj);
  }

  if (respuesta.status === 404) {
    // El usuario aún no ha guardado la tarjeta en su Wallet: no hay nada que actualizar.
    return 'sin_objeto';
  }

  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw errorDeGoogle(respuesta.status, datos);

  return 'sincronizado';
}

module.exports = {
  SCOPE,
  configuracion,
  classIdDe,
  obtenerToken,
  construirClase,
  crearClase,
  obtenerClase,
  resolverClassId,
  objectIdDe,
  qrDeTarjeta,
  generarEnlaceTarjeta,
  claseAdmiteTarjetas,
  actualizarSaldos,
};
