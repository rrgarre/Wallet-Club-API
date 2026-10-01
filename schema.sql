-- ============================================================
--  Wallet Club - Esquema MySQL / MariaDB
--  Ejecutar contra la base de datos REMOTA (DB_NAME del .env)
-- ============================================================

-- ------------------------------------------------------------
-- admin
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admins (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre        VARCHAR(100) NOT NULL,
  passwordHash  VARCHAR(255) NOT NULL,
  createdAt     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admins_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- comercios
--  idRandomLargo: identifica al comercio en URLs/registro.
--  NO da acceso: sólo sirve para localizar el comercio.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comercios (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre            VARCHAR(150) NOT NULL,
  -- Login (v1.8): nombre de usuario ÚNICO global (3-32, [a-z0-9_],
  -- en minúsculas). NULL = comercio heredado pendiente de rellenar.
  nombreUsuario     VARCHAR(32)  NULL,
  puntosPremio      INT          NOT NULL DEFAULT 10,
  premioDescripcion VARCHAR(255) NULL,
  -- v1.10: techo de premios de sus tarjetas. 0 = SIN LÍMITE.
  -- Si un movimiento dejara los premios por encima del techo, se recortan
  -- silenciosamente al máximo en esa misma operación.
  maximoPremios     INT          NOT NULL DEFAULT 0,
  activo            TINYINT(1)   NOT NULL DEFAULT 1,
  idRandomLargo     CHAR(48)     NOT NULL,
  -- 1ª contraseña: la del comercio (rol 'comercio').
  passwordHash      VARCHAR(255) NOT NULL,
  -- 2ª contraseña (v1.8): la de operario/camarero (rol 'operario').
  -- En el login se comprueba ANTES que passwordHash.
  operarioHash      VARCHAR(255) NULL,
  -- Google Wallet: id de la CLASE (plantilla) creada para el comercio
  googleWalletClaseId       VARCHAR(128) NULL,
  googleWalletClaseEstado   VARCHAR(32)  NULL,
  googleWalletClaseCreadaEn TIMESTAMP    NULL,
  createdAt         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt         TIMESTAMP    NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_comercios_idRandomLargo (idRandomLargo),
  UNIQUE KEY uq_comercios_nombreUsuario (nombreUsuario),
  KEY ix_comercios_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- tarjetas  (cliente / socio)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tarjetas (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  comercioId   INT UNSIGNED NOT NULL,
  nombre       VARCHAR(150) NOT NULL,
  email        VARCHAR(190) NOT NULL,
  -- Sistema de la tarjeta (v1.7): 'google' | 'apple'. El mismo email
  -- puede tener 1 tarjeta por sistema (son independientes entre sí).
  sistema      VARCHAR(10)  NOT NULL DEFAULT 'google',
  puntos       INT          NOT NULL DEFAULT 0,
  premios      INT          NOT NULL DEFAULT 0,
  passwordHash VARCHAR(255) NOT NULL,
  activo       TINYINT(1)   NOT NULL DEFAULT 1,
  -- Google Wallet: id del OBJETO (tarjeta) de este usuario en Google Wallet.
  -- Se rellena al registrar cuando el comercio YA tiene clase creada.
  googleWalletObjetoId VARCHAR(128) NULL,
  createdAt    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt    TIMESTAMP    NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tarjetas_comercio_email (comercioId, email, sistema),
  KEY ix_tarjetas_comercio (comercioId),
  CONSTRAINT fk_tarjetas_comercio
    FOREIGN KEY (comercioId) REFERENCES comercios (id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- operaciones  (libro de movimientos: puntos y premios)
--  idempotenciaKey: identificador único de operación enviado por el
--  cliente para poder reintentar sin duplicar el movimiento.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS operaciones (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tarjetaId       INT UNSIGNED    NOT NULL,
  comercioId      INT UNSIGNED    NOT NULL,
  tipo            VARCHAR(40)     NOT NULL,   -- acumulacion | canje | correccion | ajuste | canje_automatico
  puntosDelta     INT             NOT NULL DEFAULT 0,
  premiosDelta    INT             NOT NULL DEFAULT 0,
  descripcion     VARCHAR(255)    NULL,
  nombre          VARCHAR(100)    NULL,       -- camarero / persona (NULL en operaciones estándar)
  codigoCamarero  VARCHAR(50)     NULL,
  idempotenciaKey VARCHAR(64)     NULL,
  createdAt       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_operaciones_idem (tarjetaId, idempotenciaKey),
  KEY ix_operaciones_tarjeta (tarjetaId),
  KEY ix_operaciones_comercio (comercioId),
  KEY ix_operaciones_fecha (createdAt),
  CONSTRAINT fk_operaciones_tarjeta
    FOREIGN KEY (tarjetaId) REFERENCES tarjetas (id) ON DELETE CASCADE,
  CONSTRAINT fk_operaciones_comercio
    FOREIGN KEY (comercioId) REFERENCES comercios (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Usuario admin inicial:
--   npm run admin -- <nombre> <password>
--   (crea o actualiza el hash de ese admin, nunca guarda la password plana)
-- ------------------------------------------------------------
