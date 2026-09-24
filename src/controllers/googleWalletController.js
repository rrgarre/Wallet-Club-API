// =====================================================================
//  Controller: Google Wallet (alta de CLASE de fidelización)
//  Sólo rol 'admin'.
//
//  Crea la CLASE (plantilla) del comercio en Google Wallet y guarda su
//  id en la BD. NO crea instancias/tarjetas: eso vendrá después.
// =====================================================================
const dbComercios = require('../db/comercios');
const googleWallet = require('../services/googleWalletService');
const { notFound, conflict, badRequest } = require('../utils/errors');
const { texto, urlHttps, colorHex } = require('../utils/validate');

const REVIEW_STATUS = ['DRAFT', 'UNDER_REVIEW'];

/**
 * POST /api/admin/comercios/:idRandomLargo/google-wallet/clase
 *
 * Path:
 *   :idRandomLargo  idRandomLargo de un comercio EXISTENTE (también es el
 *                   sufijo de la clase: <issuerId>.<idRandomLargo>)
 *
 * Body:
 *   imgLogo          (obligatoria) URL HTTPS pública del logo
 *   imgHero          (opcional)    URL HTTPS del banner
 *   imgModulo        (opcional)    URL HTTPS de la foto del módulo
 *   hexBackgroundColor (opcional)  '#rgb' | '#rrggbb'
 *                    Si NO se envía, el campo se omite y Google usa el
 *                    color dominante de imgHero (omitir NO da error)
 *   terminosTexto    (obligatorio) cuerpo del bloque "Términos"
 *   reviewStatus     (opcional)    DRAFT | UNDER_REVIEW (defecto UNDER_REVIEW)
 *
 * Respuestas:
 *   201 clase creada
 *   409 GOOGLE_CLASE_YA_EXISTE (ya existía en Google; el front debe poder
 *       ver este conflicto y actuar en consecuencia)
 */
async function crearClase(req, res, next) {
  try {
    const idRandomLargo = texto(req.params.idRandomLargo, 'idRandomLargo', { max: 64 });
    if (!/^[A-Za-z0-9._-]+$/.test(idRandomLargo)) {
      throw notFound('Comercio no encontrado', 'COMERCIO_NOT_FOUND');
    }

    // El sufijo debe corresponder a un comercio real.
    const comercio = await dbComercios.findByIdRandomLargo(idRandomLargo);
    if (!comercio) throw notFound('Comercio no encontrado', 'COMERCIO_NOT_FOUND');

    // ---- Validación de parámetros ----
    const imgLogo = urlHttps(req.body.imgLogo, 'imgLogo'); // obligatoria
    const imgHero = urlHttps(req.body.imgHero, 'imgHero', { requerido: false });
    const imgModulo = urlHttps(req.body.imgModulo, 'imgModulo', { requerido: false });
    const hexBackgroundColor = colorHex(req.body.hexBackgroundColor, 'hexBackgroundColor');
    const terminosTexto = texto(req.body.terminosTexto, 'terminosTexto', { max: 1000 });

    let reviewStatus = 'UNDER_REVIEW';
    if (req.body.reviewStatus !== undefined && req.body.reviewStatus !== null && String(req.body.reviewStatus).trim() !== '') {
      reviewStatus = String(req.body.reviewStatus).trim().toUpperCase();
      if (!REVIEW_STATUS.includes(reviewStatus)) {
        throw badRequest(
          `reviewStatus debe ser uno de: ${REVIEW_STATUS.join(', ')}`,
          'VALIDATION'
        );
      }
    }

    const resultado = await googleWallet.crearClase({
      comercio,
      idRandomLargo,
      imgLogo,
      imgHero,
      imgModulo,
      hexBackgroundColor,
      terminosTexto,
      reviewStatus,
    });

    // ---- Clase YA existente en Google: se conoce el conflicto ----
    if (!resultado.creada) {
      // Guardamos el id (la clase existe, eso es un hecho) y su estado.
      let estado = null;
      try {
        const claseActual = await googleWallet.obtenerClase(resultado.claseId);
        estado = claseActual?.reviewStatus ?? null;
      } catch (_) {
        /* el estado no bloquea el 409 */
      }
      await dbComercios.guardarClaseGoogleWallet(comercio.id, resultado.claseId, estado);
      throw conflict(
        `La clase "${resultado.claseId}" ya existe en Google Wallet` +
          (estado ? ` (estado: ${estado})` : '') +
          '. Si necesitas cambiar su estilo, habrá que enviar un PATCH.',
        'GOOGLE_CLASE_YA_EXISTE'
      );
    }

    // ---- Alta correcta: se recuerda el id de la clase ----
    const clase = resultado.clase || {};
    const estado = clase.reviewStatus || reviewStatus;
    const comercioActualizado = await dbComercios.guardarClaseGoogleWallet(
      comercio.id,
      resultado.claseId,
      estado
    );

    res.status(201).json({
      ok: true,
      clase: {
        id: resultado.claseId,
        reviewStatus: estado,
        issuerName: comercio.nombre,
        programName: `Fidelización ${comercio.nombre}`,
      },
      comercio: comercioActualizado,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { crearClase };
