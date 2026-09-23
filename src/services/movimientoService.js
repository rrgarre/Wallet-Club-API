// =====================================================================
//  SERVICIO DE MOVIMIENTOS (puntos / premios)
// ---------------------------------------------------------------------
//  Reglas aplicadas aquí:
//   1. ATOMICIDAD: el nuevo saldo y el registro de la operación se hacen
//      en la MISMA transacción, con SELECT ... FOR UPDATE sobre la fila
//      de la tarjeta (dos movimientos concurrentes se serializan).
//   2. IDEMPOTENCIA: el cliente envía un identificador único de
//      operación (`idempotencia` en el body o cabecera `Idempotency-Key`).
//      Si ya se registró, se devuelve tal cual y NO se vuelve a aplicar.
//   3. CANJE AUTOMÁTICO: si los puntos superan `puntosPremio` del
//      comercio se descuentan n * puntosPremio y se suman n premios
//      (n = floor(puntos / puntosPremio)).
//   4. PREMIOS (y puntos) nunca pueden quedar en negativo.
//   5. Operaciones "no estándar" exigen nombre + código de camarero
//      (regla aplicada por el servidor, configurable en .env).
// =====================================================================
const dbTarjetas = require('../db/tarjetas');
const dbOperaciones = require('../db/operaciones');
const { withTransaction } = require('../db/connection');
const { env } = require('../config/env');
const { AppError, badRequest, notFound, conflict } = require('../utils/errors');

const TIPOS_VALIDOS = ['acumulacion', 'canje', 'correccion', 'ajuste'];

/** Tipo por defecto según los deltas. */
function tipoPorDefecto(puntosDelta, premiosDelta) {
  if (premiosDelta < 0 && puntosDelta === 0) return 'canje';
  if (premiosDelta > 0 || puntosDelta < 0) return 'correccion';
  return 'acumulacion';
}

/**
 * ¿La operación necesita trazabilidad de persona (nombre + camarero)?
 *  - manipulación manual de premios (premiosDelta > 0)
 *  - decremento de puntos (puntosDelta < 0)
 *  - incremento de puntos demasiado grande (puntosDelta > UMBRAL_PUNTOS_NOMBRE)
 * El canje de premios (premiosDelta < 0) y la acumulación normal son
 * operaciones estándar: el nombre va fijado (NULL) y no se rellena.
 */
function requiereNombreOperacion(puntosDelta, premiosDelta) {
  if (premiosDelta > 0) return true;
  if (puntosDelta < 0) return true;
  if (puntosDelta > env.umbralPuntosNombre) return true;
  return false;
}

function validarCamarero(nombre, codigoCamarero) {
  if (!nombre || !String(nombre).trim()) {
    throw badRequest(
      'Esta operación requiere el nombre de la persona que la ejecuta (camarero)',
      'NOMBRE_REQUERIDO'
    );
  }
  if (!codigoCamarero || !String(codigoCamarero).trim()) {
    throw badRequest('Esta operación requiere el código de camarero', 'CODIGO_CAMARERO_REQUERIDO');
  }
  const codigo = String(codigoCamarero).trim().toUpperCase();
  // Si hay una lista de códigos válidos en .env (CAMARERO_CODIGOS), se exige.
  if (env.camareroCodigos.length && !env.camareroCodigos.includes(codigo)) {
    throw badRequest('Código de camarero no válido', 'CODIGO_CAMARERO_INVALIDO');
  }
  return { nombre: String(nombre).trim(), codigo };
}

function sanearTarjeta(tarjeta) {
  if (!tarjeta) return null;
  const { passwordHash, ...resto } = tarjeta;
  return resto;
}

/**
 * Aplica un movimiento sobre una tarjeta de forma atómica e idempotente.
 *
 * @param {object} p
 * @param {number} p.comercioId    Comercio dueño de la tarjeta (del token o del admin)
 * @param {number} p.tarjetaId     Tarjeta sobre la que se mueve
 * @param {number} p.puntosPremio  Umbral de canje del comercio
 * @param {number} p.puntosDelta   Variación de puntos (+/-)
 * @param {number} p.premiosDelta  Variación de premios (+/-)
 * @param {string} [p.tipo]        acumulacion | canje | correccion | ajuste
 * @param {string} [p.descripcion]
 * @param {string} [p.nombre]
 * @param {string} [p.codigoCamarero]
 * @param {string} [p.idempotencia] Identificador único del reintento
 * @returns {Promise<{duplicado:boolean, tarjeta:object, ...}>}
 */
async function aplicarMovimiento(p) {
  const {
    comercioId,
    tarjetaId,
    puntosPremio,
    puntosDelta,
    premiosDelta,
    tipo,
    descripcion = null,
    idempotencia = null,
  } = p;

  if (puntosDelta === 0 && premiosDelta === 0) {
    throw badRequest('La operación no modifica ni puntos ni premios', 'SIN_EFECTO');
  }

  const tipoFinal = tipo ?? tipoPorDefecto(puntosDelta, premiosDelta);
  if (!TIPOS_VALIDOS.includes(tipoFinal)) {
    throw badRequest(
      `Tipo de operación no válido. Permitidos: ${TIPOS_VALIDOS.join(', ')}`,
      'TIPO_INVALIDO'
    );
  }

  // --- 1) Reintento: se comprueba ANTES de las validaciones de contenido
  //     (un retry debe devolver el resultado original, no un 400 nuevo).
  if (idempotencia) {
    const yaHecha = await dbOperaciones.findByIdempotencyKey(tarjetaId, idempotencia);
    if (yaHecha) {
      if (
        Number(yaHecha.puntosDelta) !== puntosDelta ||
        Number(yaHecha.premiosDelta) !== premiosDelta ||
        yaHecha.tipo !== tipoFinal
      ) {
        // Misma clave pero otra operación distinta: se rechaza.
        throw conflict(
          `La idempotencia '${idempotencia}' ya se usó con otra operación distinta (id ${yaHecha.id})`,
          'IDEMPOTENCIA_CONFLICTO'
        );
      }
      const tarjeta = await dbTarjetas.findById(tarjetaId);
      return respuestaDuplicada(yaHecha, tarjeta);
    }
  }

  // --- Trazabilidad de persona (si aplica) -------------------------------
  let nombre = null;
  let codigoCamarero = null;
  if (requiereNombreOperacion(puntosDelta, premiosDelta) && env.exigirNombreServidor) {
    const v = validarCamarero(p.nombre, p.codigoCamarero);
    nombre = v.nombre;
    codigoCamarero = v.codigo;
  } else if (p.nombre || p.codigoCamarero) {
    nombre = p.nombre ? String(p.nombre).trim() : null;
    codigoCamarero = p.codigoCamarero ? String(p.codigoCamarero).trim().toUpperCase() : null;
  }

  // --- 2) Transacción atómica --------------------------------------------
  try {
    return await withTransaction(async (conn) => {
      // Bloqueo de la tarjeta: serializa movimientos concurrentes.
      const tarjeta = await dbTarjetas.lockForUpdate(conn, tarjetaId, comercioId);
      if (!tarjeta) {
        throw notFound('Tarjeta no encontrada o no pertenece a este comercio', 'TARJETA_NOT_FOUND');
      }
      if (Number(tarjeta.activo) !== 1) {
        throw new AppError(403, 'La tarjeta está inactiva', 'TARJETA_INACTIVA');
      }

      // Nuevos saldos
      let nuevosPuntos = Number(tarjeta.puntos) + puntosDelta;
      let nuevosPremios = Number(tarjeta.premios) + premiosDelta;

      if (nuevosPremios < 0) {
        throw badRequest(
          `Operación no permitida: los premios quedarían en negativo ` +
            `(hay ${tarjeta.premios}, variación ${premiosDelta})`,
          'PREMIOS_NEGATIVOS'
        );
      }
      if (nuevosPuntos < 0) {
        throw badRequest(
          `Operación no permitida: los puntos quedarían en negativo ` +
            `(hay ${tarjeta.puntos}, variación ${puntosDelta})`,
          'PUNTOS_NEGATIVOS'
        );
      }

      // Canje automático de puntos -> premios
      let conversion = null;
      const umbral = Number(puntosPremio);
      if (puntosDelta > 0 && umbral > 0 && nuevosPuntos >= umbral) {
        const n = Math.floor(nuevosPuntos / umbral);
        nuevosPuntos -= n * umbral;
        nuevosPremios += n;
        conversion = { n, umbral, puntosDescontados: n * umbral };
      }

      // Saldo + registro de la operación: mismo proceso, mismo commit.
      await dbTarjetas.updateSaldos(conn, tarjetaId, nuevosPuntos, nuevosPremios);

      const idOperacion = await dbOperaciones.insert(conn, {
        tarjetaId,
        comercioId,
        tipo: tipoFinal,
        puntosDelta,
        premiosDelta,
        descripcion,
        nombre,
        codigoCamarero,
        idempotenciaKey: idempotencia,
      });

      let idConversion = null;
      if (conversion) {
        idConversion = await dbOperaciones.insert(conn, {
          tarjetaId,
          comercioId,
          tipo: 'canje_automatico',
          puntosDelta: -conversion.puntosDescontados,
          premiosDelta: conversion.n,
          descripcion:
            `Conversión automática: ${conversion.puntosDescontados} puntos => ` +
            `${conversion.n} premio(s) (${conversion.umbral} puntos por premio)`,
          nombre: 'sistema',
          codigoCamarero: null,
          idempotenciaKey: idempotencia ? `${idempotencia}:auto` : null,
        });
      }

      return {
        ok: true,
        duplicado: false,
        idOperacion,
        idConversion,
        conversion,
        requiereNombre: requiereNombreOperacion(puntosDelta, premiosDelta),
        tarjeta: sanearTarjeta({ ...tarjeta, puntos: nuevosPuntos, premios: nuevosPremios }),
      };
    });
  } catch (err) {
    // Carrera entre dos reintentos simultáneos: gana uno, el otro entra aquí.
    if (err && err.code === 'ER_DUP_ENTRY' && idempotencia) {
      const yaHecha = await dbOperaciones.findByIdempotencyKey(tarjetaId, idempotencia);
      if (yaHecha) {
        const tarjeta = await dbTarjetas.findById(tarjetaId);
        return respuestaDuplicada(yaHecha, tarjeta);
      }
    }
    throw err;
  }
}

async function respuestaDuplicada(operacion, tarjeta) {
  const historial = await dbOperaciones.listByTarjeta(operacion.tarjetaId, 100);
  return {
    ok: true,
    duplicado: true,
    mensaje: 'Operación ya registrada previamente: no se ha aplicado de nuevo',
    idOperacion: operacion.id,
    operacion,
    tarjeta: sanearTarjeta(tarjeta),
    historial,
  };
}

module.exports = {
  aplicarMovimiento,
  requiereNombreOperacion,
  tipoPorDefecto,
  TIPOS_VALIDOS,
};
