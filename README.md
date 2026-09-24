# Wallet Club API

API REST (Express + JWT) con base de datos **MySQL/MariaDB remota**.

📄 **`API_CONTRACT.md`** → contrato de interfaz completo (endpoints, payloads,
códigos de error, idempotencia) pensado para consumidores de la API: es el
documento que hay que dar a quien vaya a construir los clientes/fronts.

## Puesta en marcha

```bash
npm install
# 1. Copiar credenciales de la BD y secretos
copy .env.example .env      # y rellenar DB_*, JWT_SECRET

# 2. Crear las tablas en la BD remota
npm run db:setup            # crea lo que falte (IF NOT EXISTS)
npm run db:setup -- --drop  # ¡BORRA las 4 tablas y las crea de nuevo!

# 3. Crear el primer admin (sólo guarda el hash)
npm run admin -- miraadmin MiPassword123

# 4. Arrancar
npm run dev     # o npm start

# Comprobación funcional sin necesidad de BD (usa una BD en memoria simulada)
npm run smoke   ->  79/79 comprobaciones OK
```

Comprobar: `GET /health` → `{ ok: true, db: "conectada" }`

## Estructura

```
.env                    credenciales (no se sube a git)
.env.example            plantilla comentada
schema.sql              CREATE TABLE de las 4 entidades
src/
  server.js             arranque + validación + conexión BD
  app.js                Express (middlewares, rutas, errores)
  config/
    db.js               ★ ZONA DE CREDENCIALES: lee .env y crea el pool
    env.js              resto de variables de entorno y reglas
  db/                   ficheros separados que hablan con la BD (SQL plano)
    connection.js       query/get/execute + withTransaction()
    admin.js  comercios.js  tarjetas.js  operaciones.js
  middlewares/
    auth.js             JWT + requireRole('admin'|'comercio'|'tarjeta')
    comercioContext.js  resuelve el comercio y exige activo=true
    errors.js           respuestas de error homogéneas
  services/
    movimientoService.js  lógica de negocio: atomicidad, idempotencia,
                          canje automático, premios negativos, camarero
    googleWalletService.js Google Wallet: token OAuth2 (service account)
                          y alta de CLASE de fidelización (loyaltyClass)
  controllers/          auth, tarjeta, comercio, admin, googleWallet
  routes/               público, tarjeta, comercio, admin
scripts/createAdmin.js  alta/actualización de admin
scripts/setupDb.js      instalación del esquema (npm run db:setup)
scripts/smoke.js        prueba funcional end-to-end (npm run smoke)
```

## Entidades

| Tabla | Campos |
|---|---|
| `admins` | id, nombre, passwordHash, createdAt |
| `comercios` | id, nombre, puntosPremio, premioDescripcion, activo, idRandomLargo, passwordHash, googleWalletClaseId, googleWalletClaseEstado, googleWalletClaseCreadaEn, createdAt, updatedAt |
| `tarjetas` | id, comercioId, nombre, email, puntos, premios, passwordHash, activo, googleWalletObjetoId, createdAt, updatedAt |
| `operaciones` | id, tarjetaId, comercioId, tipo, puntosDelta, premiosDelta, descripcion, nombre, codigoCamarero, idempotenciaKey, createdAt |

- `passwordHash` = bcrypt (10 rounds). La password plana nunca se guarda ni se devuelve.
- `idRandomLargo` (48 hex, aleatorio) **identifica** al comercio en la URL de registro.
  **No es autenticación**: no concede ningún acceso privado; todas las rutas
  privadas exigen token JWT emitido en un login con password.

## Endpoints

### Públicos (`/api`)
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/auth/admin/login` | `{ nombre, password }` → token rol `admin` |
| POST | `/auth/comercio/login` | `{ password, idRandomLargo \| nombre }` → token rol `comercio` (exige `activo`) |
| POST | `/auth/tarjeta/login` | `{ email, password, comercioId? }` → token rol `tarjeta` |
| POST | `/registro/tarjeta/:idRandomLargo` | `{ nombre, email, password }` → **deduce la comercioId** y da de alta al cliente. Devuelve además `googleWalletUrl` (enlace «Añadir a Google Wallet», `null` si el comercio no tiene clase creada) |

### Tarjeta (token `tarjeta`; admin permitido)
| GET | `/tarjeta/perfil` | Parámetros de la tarjeta (sin hash). Admin: `?tarjetaId=` |
| GET | `/tarjeta/operaciones` | Historial propio |

### Comercio (token `comercio`; admin permitido; **exige `activo=true`**)
| GET | `/comercio/perfil` | Datos del comercio (admin: `?comercioId=` o en body) |
| GET | `/comercio/tarjetas` | Tarjetas del comercio |
| GET | `/comercio/tarjetas/:id` | Tarjeta sólo si pertenece al comercio logueado |
| POST | `/comercio/tarjetas/:id/movimiento` | Mover puntos/premios + crear operación |

### Admin (token `admin`)
| GET | `/admin/comercios` · `/admin/comercios/:id` |
| POST | `/admin/comercios` → genera `idRandomLargo` |
| PATCH | `/admin/comercios/:id` (nombre, password, puntosPremio, premioDescripcion, activo) |
| POST | `/admin/comercios/:idRandomLargo/google-wallet/clase` → alta de la **CLASE** de Google Wallet (sólo clase, no tarjetas) |
| GET | `/admin/tarjetas?comercioId=` · `/admin/tarjetas/:id` |
| GET | `/admin/operaciones?comercioId=&tarjetaId=&tipo=&desde=&hasta=&pagina=&tamano=` |

> El admin está permitido en las rutas de tarjeta y comercio; en las de
> comercio debe indicar `comercioId` (nunca se infiere de un idRandomLargo).

## Reglas del endpoint de movimiento

`POST /api/comercio/tarjetas/:id/movimiento`

```json
{
  "puntosDelta": 30,
  "premiosDelta": 0,
  "tipo": "acumulacion",
  "descripcion": "3 desayunos",
  "nombre": "Ana",
  "codigoCamarero": "ANA-01",
  "idempotencia": "uuid-o-numero-unico-del-front"
}
```

1. **Atomicidad** — en una única transacción MySQL:
   `SELECT ... FOR UPDATE` de la tarjeta → cálculo de saldos →
   `UPDATE tarjetas` → `INSERT operaciones` (y la conversión automática).
   Si falla cualquiera de los pasos: **ROLLBACK** (no hay saldo sin
   movimiento ni movimiento sin saldo).
2. **Idempotencia** — clave única `(tarjetaId, idempotenciaKey)`.
   Reenviar la misma `idempotencia` (body o cabecera `Idempotency-Key`)
   con el MISMO contenido devuelve `duplicado: true` y **no** vuelve a
   sumar. Si la misma clave llega con un contenido distinto se responde
   `409 IDEMPOTENCIA_CONFLICTO`. Si dos reintentos simultáneos llegan a
   la BD a la vez, gana uno y el otro recibe la operación ya registrada
   (la clave única hace rollback del segundo).
3. **Canje automático** — si `puntosDelta > 0` y los nuevos puntos llegan
   a `puntosPremio`, se descuentan `n * puntosPremio` y se suman `n`
   premios (n = floor(puntos/umbral)). Se registra además una segunda
   operación `tipo=canje_automatico` para que el libro cuadre.
4. **Premios negativos** → rechazo `409/400 PREMIOS_NEGATIVOS`
   (también se rechazan puntos negativos).
5. **Tipos** — `acumulacion` (sumar puntos), `canje` (restar premios),
   `correccion`/`ajuste` (restar puntos o sumar premios a mano). Si no se
   envía `tipo` se deduce de los deltas.

### Operación estándar vs. operación con nombre

| Movimiento | ¿Estándar? | `nombre` / `codigoCamarero` |
|---|---|---|
| Sumar puntos (dentro del umbral) | sí | no se pide (queda `NULL`) |
| Restar premios / canjear | sí | no se pide |
| Sumar premios a mano (`premiosDelta > 0`) | no | **obligatorios** |
| Restar puntos (`puntosDelta < 0`) | no | **obligatorios** |
| Incremento grande de puntos (> `UMBRAL_PUNTOS_NOMBRE`) | no | **obligatorios** |

- `EXIGIR_NOMBRE_SERVIDOR=true` (default): el servidor bloquea la operación
  si faltan nombre y código (`NOMBRE_REQUERIDO`, `CODIGO_CAMARERO_REQUERIDO`).
  Ponlo a `false` si quieres que sólo el front decida pedirlos.
- `CAMARERO_CODIGOS=ANA-01,LUIS-02`: si se indica, el código se valida
  contra esa lista. Vacío = se acepta cualquier código (sólo se registra).

## Google Wallet (clases de fidelización)

`POST /api/admin/comercios/:idRandomLargo/google-wallet/clase` crea la
**clase** (plantilla) del comercio en Google Wallet y guarda su id en
`comercios.googleWalletClaseId`. **No** crea tarjetas individuales.

Variables en `.env`:

```bash
GOOGLE_WALLET_ISSUER_ID=...        # id de emisor: forma el CLASS_ID <issuerId>.<idRandomLargo>
GOOGLE_WALLET_CREDENTIALS=...      # ruta al JSON de la service account (ignorado por git)
FRONT_URL=...                      # URL base del front: QR = <FRONT_URL>/comercio/captura/<idTarjeta>
```

- La service account necesita el rol GCP **«Wallet Object Issuer»**.
- Si la clase ya existe → `409 GOOGLE_CLASE_YA_EXISTE`.
- Si falta alguna de las dos variables → `503 GOOGLE_WALLET_SIN_CONFIG`
  (el resto de la API funciona igual).

### Tarjetas (objetos) en Google Wallet

Al registrarse un cliente, si el comercio **ya tiene clase creada**, la API
devuelve además `googleWalletUrl` (enlace «Añadir a Google Wallet», firma local
de un JWT `savetowallet`: no llama a Google) y guarda el id del objeto en
`tarjetas.googleWalletObjetoId`. Si el comercio no tiene clase, o está en
`DRAFT`, el alta se completa con `googleWalletUrl: null`.

## Respuestas

```json
{ "ok": true,  "tarjeta": { ... } }
{ "ok": false, "error": { "message": "...", "code": "PREMIOS_NEGATIVOS" } }
```
