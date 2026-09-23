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
  puntosPremio      INT          NOT NULL DEFAULT 10,
  premioDescripcion VARCHAR(255) NULL,
  activo            TINYINT(1)   NOT NULL DEFAULT 1,
  idRandomLargo     CHAR(48)     NOT NULL,
  passwordHash      VARCHAR(255) NOT NULL,
  createdAt         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt         TIMESTAMP    NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_comercios_idRandomLargo (idRandomLargo),
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
  puntos       INT          NOT NULL DEFAULT 0,
  premios      INT          NOT NULL DEFAULT 0,
  passwordHash VARCHAR(255) NOT NULL,
  activo       TINYINT(1)   NOT NULL DEFAULT 1,
  createdAt    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt    TIMESTAMP    NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tarjetas_comercio_email (comercioId, email),
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
