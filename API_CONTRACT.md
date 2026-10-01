# Wallet Club API — Contrato de API

> **Versión 1.9 · documento de interfaz.** Fuente de verdad para cualquier cliente
> (web, móvil, panel, script). Todo lo que no esté documentado aquí **no existe**
> y no debe asumirse. Los ejemplos de este documento son respuestas **reales**
> capturadas del servidor en ejecución.
> *v1.1: añadido el endpoint de alta de clase de Google Wallet (§7.9) y los
> campos `googleWalletClaseId`/`googleWalletClaseEstado` de los comercios.*
> *v1.2: el registro de tarjeta devuelve `googleWalletUrl` (enlace «Añadir a
> Google Wallet») y los objetos tarjeta incluyen `googleWalletObjetoId`.*
> *v1.3: el movimiento de puntos/premios devuelve `googleWallet`, resultado de
> la sincronización de los saldos con Google Wallet (§5.4).*
> *v1.4: el registro de tarjeta se puede **reanudar** con la misma contraseña
> (201 con el enlace de Google Wallet en lugar de `EMAIL_DUPLICADO`) y el
> login de tarjeta devuelve `googleWalletUrl` (§3.4, §3.5).*
> *v1.5: el QR (`barcode`) de la tarjeta en Google Wallet contiene **sólo el
> identificador** de la tarjeta, nunca la URL de captura (§3.5).*
> *v1.6: el registro de tarjeta **no pide contraseña** (la pone el servidor:
> `USUARIO_PASSWORD`), **ya no devuelve `token`/`role`** (el alta no deja
> logueado), el login de comercio **sólo admite `idRandomLargo`** (sin
> `nombre`) y hay endpoint nuevo para que el comercio cambie su contraseña
> (§3.3, §3.4, §3.5, §5.5). **20 endpoints**.*
> *v1.7: las tarjetas tienen **`sistema`** (`google` \| `apple`). El registro
> acepta `sistema` en el body (defecto `google`), los duplicados se miran
> **por sistema** (mismo email ⇒ 1 tarjeta google + 1 tarjeta apple
> independientes), las tarjetas apple **no se toca Google Wallet**
> (`googleWalletUrl: null`, `mensaje: "sistema_apple"`, y el movimiento
> devuelve `googleWallet: "sistema_apple"`). `sistema` se expone en
> login/perfil/listados (§3.4, §3.5, §4.1, §5.2, §5.4, §7.5). **Sin endpoint
> nuevo: sigue habiendo 20**.*
> *v1.8: el comercio se loguea con **`nombreUsuario` + `password`** (el
> `idRandomLargo` ya NO sirve para entrar; sigue para la URL de registro, el
> QR y la clase). Nueva **2ª contraseña de operario** y nuevo **rol
> `operario`** (camarero): misma URL de login, la contraseña decide el rol
> (primero se prueba la de operario, luego la del comercio). El operario sólo
> ve la tarjeta escaneada y mueve sus contadores (§2, §3.3, §5, §7.3, §7.4).
> **Sin endpoint nuevo: sigue habiendo 20**.*
> *v1.9: endpoint nuevo para **cambiar la contraseña de operario**
> (`PATCH /api/comercio/operario-password`, roles `comercio` y `admin`,
> §5.6) y regla general: **la contraseña de comercio y la de operario
> nunca pueden ser iguales** (nuevo error `400 PASSWORDS_IGUALES`; aplica
> también a `PATCH /api/comercio/password` y al alta/edición de comercios
> de admin: §5.5, §7.3, §7.4, §8). **21 endpoints**.*

---

## 1. Información general

| Aspecto | Valor |
|---|---|
| Base URL (desarrollo) | `http://localhost:3000` |
| Base URL (producción) | *la defina el propietario del proyecto* |
| Prefijo de rutas de negocio | `/api` |
| Salud del servicio | `GET /health` (sin autenticación) |
| Content-Type | `application/json; charset=utf-8` (sólo JSON, UTF-8) |
| Autenticación | `Authorization: Bearer <JWT>` (sin cookies) |
| CORS | Habilitado, origen abierto (`*`) |
| Rate limiting | **No aplicado** por la API |
| Versionado en URL | No hay (`/v1` no existe) |
| Webhooks / SSE / WebSockets | **No existen** |
| Subida de ficheros | **No existe** (sólo JSON) |

### Convención de respuestas

Toda respuesta es JSON con una de estas dos formas:

```jsonc
// ÉXITO
{ "ok": true,  ...payload }

// ERROR
{ "ok": false, "error": { "message": "texto en español", "code": "CODIGO" } }
```

- **`error.message`** es texto listo para mostrar al usuario (español).
  **No hay campo `field`/`campo`**: para errores de validación, el nombre del
  campo aparece dentro del mensaje (`"El campo 'puntosDelta' debe ser un número entero"`).
- **`error.code`** es un identificador estable para ramificar en el cliente
  (tabla de códigos en §8). Si un `code` no se reconoce, se muestra `message`.
- Los campos `null` significan «sin valor» y **deben distinguirse** de campos
  ausentes (`undefined`).
- **Nunca** se devuelve `passwordHash` ni ningún hash.

### Códigos HTTP usados

| Código | Uso |
|---|---|
| `200` | Lectura correcta, o movimiento ya aplicado previamente (idempotencia) |
| `201` | Recurso o movimiento creados |
| `400` | Validación / regla de negocio incumplida (revisar `error.code`) |
| `401` | Sin token, token caducado o inválido, credenciales incorrectas |
| `403` | Rol insuficiente, comercio/tarjeta inactivo |
| `404` | Recurso inexistente o que no pertenece al solicitante |
| `409` | Conflicto (email duplicado, email ambiguo, idempotencia reutilizada, clase Google Wallet repetida) |
| `500` | Error interno (`code: "INTERNAL"`) — reintentable |
| `502` | Google Wallet no responde / rechaza la llamada (revisar `error.code`) |
| `503` | Google Wallet sin configurar en el servidor |

### Tipos de datos

| Campo | Tipo |
|---|---|
| `id`, `comercioId`, `tarjetaId` | número entero |
| `puntos`, `premios`, `puntosPremio`, `puntosDelta`, `premiosDelta` | número **entero** (aceptan signo en los delta) |
| `activo` | `1` = sí, `0` = no (**número**, no booleano) |
| `createdAt`, `updatedAt` | string ISO 8601 UTC, p. ej. `"2026-09-23T06:53:26.000Z"`; `updatedAt` puede ser `null` |
| `idRandomLargo` | string de 48 caracteres hexadecimales |
| `googleWalletObjetoId`, `googleWalletClaseId` | string o `null` (ids de Google Wallet) |

---

## 2. Autenticación y roles

- Los tokens son **JWT firmado**, duración por defecto **8 h** (`JWT_EXPIRES_IN`).
- Payload: `{ "sub": <id>, "role": "admin"|"comercio"|"operario"|"tarjeta", "nombre": "..." }`.
- **No hay refresh token ni endpoint de logout**: el cliente conserva o descarta
  el token. Ante `401 INVALID_TOKEN` → volver a pedir login.
- El `role` del payload sólo sirve para decidir la navegación del cliente; la
  autorización real la aplica siempre el servidor.

### Matriz de permisos

| Ruta | `admin` | `comercio` | `operario` | `tarjeta` |
|---|---|---|---|---|
| `/api/auth/*`, `/api/registro/tarjeta/:idRandomLargo` | pública (sin token) | | | |
| `/api/tarjeta/*` | ✅ *(`?tarjetaId=` obligatorio)* | ❌ `403` | ❌ `403` | ✅ (sus propios datos) |
| `/api/comercio/tarjetas/:id` y `.../movimiento` | ✅ *(`comercioId` obligatorio)* | ✅ (el suyo) | ✅ (el suyo) | ❌ `403` |
| resto de `/api/comercio/*` (perfil, listado, `password`) | ✅ *(`comercioId` obligatorio)* | ✅ (el suyo) | ❌ `403` | ❌ `403` |
| `/api/admin/*` | ✅ | ❌ `403` | ❌ `403` | ❌ `403` |

**Rol `operario` (v1.8, camarero):** nace en el login del comercio cuando la
contraseña introduce la de operario. Su mundo es **la tarjeta escaneada**:
`GET /api/comercio/tarjetas/:id` (leer esa tarjeta) y
`POST /api/comercio/tarjetas/:id/movimiento` (modificar sus contadores, con
las mismas reglas que el comercio: tipos, trazabilidad, idempotencia). **No**
ve el listado de tarjetas, **no** ve el perfil del comercio, **no** cambia
contraseñas, **no** toca nada del panel de comercio ni de admin.

**Consideraciones para el cliente:**

- Un token de `comercio` **nunca** puede leer datos de otro comercio; un token
  de `tarjeta` sólo los suyos. No hay que enviar «el comercio del que soy»: ya
  está en el token. El `operario` tampoco sale de su comercio.
- Si el cliente actúa como **admin sobre una ruta de comercio** debe indicar
  explícitamente `comercioId` (query string en GET, body en POST/PATCH);
  si falta → `400 COMERCIO_REQUERIDO`.
- Si el cliente actúa como **admin sobre una ruta de tarjeta** debe indicar
  `tarjetaId` en query; si falta → `400 TARJETA_REQUERIDA`.
- El token de comercio/operario se emite **sólo si `activo = 1`**; si el
  comercio se desactiva con sesión iniciada, las siguientes llamadas devuelven
  `403 COMERCIO_INACTIVO` → mostrar pantalla «comercio desactivado» y pedir
  login de nuevo.
- Igual para tarjeta: `403 TARJETA_INACTIVA`.

### `idRandomLargo`: qué es y qué NO es

- Identifica a un comercio en una URL pública (p. ej. QR de alta de cliente),
  en la URL de alta de clase y en el `objectId` de Google Wallet.
- **No es una credencial** y desde v1.8 **ya ni siquiera sirve para el login**
  (el login pide `nombreUsuario`). No da acceso a nada privado.
- El cliente no debe tratarlo como token, sesión ni clave de API.

---

## 3. Endpoints públicos (sin token)

### 3.1 `GET /health`

```json
{ "ok": true, "db": "conectada", "time": "2026-09-23T08:53:25.487Z" }
```
`503` si la base de datos no responde.

---

### 3.2 `POST /api/auth/admin/login`

| Body | Tipo | Req. |
|---|---|---|
| `nombre` | string | ✅ |
| `password` | string | ✅ |

`200`:
```json
{
  "ok": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "role": "admin",
  "usuario": { "id": 1, "nombre": "admin" }
}
```
`401 BAD_CREDENTIALS`.

---

### 3.3 `POST /api/auth/comercio/login`

| Body | Tipo | Req. |
|---|---|---|
| `nombreUsuario` | string (3–32, `[a-z0-9_]`; se compara en minúsculas) | ✅ |
| `password` | string | ✅ |

> **v1.8**: el login **sólo acepta `nombreUsuario` + `password`**. El
> `idRandomLargo` ya **no** sirve para entrar (sigue en la URL de registro, el
> QR y la clase), y el login por `nombre` tampoco existe: cualquiera de los dos
> sin `nombreUsuario` → `400 VALIDATION`.
>
> **La contraseña decide el rol**, en este orden:
> 1. se comprueba primero contra la **contraseña de operario** → `role: "operario"`;
> 2. si no cuadra, contra la **contraseña de comercio** → `role: "comercio"`.
>
> (Si ambas contraseñas fueran la misma, entraría como `operario`.)

```json
{
  "ok": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "role": "comercio",
  "usuario": {
    "id": 2, "nombre": "Café Central", "nombreUsuario": "cafe_central",
    "puntosPremio": 10,
    "premioDescripcion": "Café gratis",
    "idRandomLargo": "5949aef4b6e7e66be2a4c04e0a723c92d618d6e3bcac6b43"
  }
}
```
- `role` puede ser **`"comercio"`** o **`"operario"`** (ver matriz de permisos
  §2): el front debe ramificar la navegación según el rol recibido.
- `400 VALIDATION` — falta `nombreUsuario` (o su formato no es válido).
- `401 BAD_CREDENTIALS` (password incorrecta **o** usuario inexistente: mismo
  error, no filtra existencia).
- `403 COMERCIO_INACTIVO` — credenciales correctas pero comercio desactivado
  (también vale con la contraseña de operario).
- ⚠ **Comercios heredados sin `nombreUsuario`** (columna `NULL` desde la
  migración v1.8): **no pueden iniciar sesión** hasta que el admin les asigne
  usuario y contraseña de operario con `PATCH /api/admin/comercios/:id`.

---

### 3.4 `POST /api/auth/tarjeta/login`

| Body | Tipo | Req. |
|---|---|---|
| `email` | string | ✅ |
| `password` | string | ✅ |
| `comercioId` | número o `idRandomLargo` | ✗ *sólo si el email está en varios comercios* |

```json
{
  "ok": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "role": "tarjeta",
  "usuario": {
    "id": 2, "nombre": "Luis Captura", "email": "luis.cap@ejemplo.com",
    "comercioId": 2, "sistema": "google", "puntos": 5, "premios": 2,
    "googleWalletObjetoId": "3388000000023208299.USER_2_COMERCIO_5949..."
  },
  "googleWalletUrl": "https://pay.google.com/gp/v/save/eyJhbGciOiJSUzI1NiIs..."
}
```
- **Contraseña de los usuarios (v1.6)**: los usuarios nuevos usan la
  **contraseña estándar del servidor** (`USUARIO_PASSWORD` en el `.env` del
  servidor; valor actual `123123`). El formulario de login la envía tal cual
  (el de alta **no** la pide: la pone el servidor). *Cualquier `password` que
  el front mande en el registro se ignora.*
- **`googleWalletUrl`** (v1.4): enlace «Añadir a Google Wallet» **regenerado**
  en cada login (misma regla que en el alta: `string` con clase aprobada,
  `null` si no hay clase / `DRAFT` / error de configuración). Sirve al
  usuario para (re)guardar la tarjeta en su Wallet en cualquier momento:
  es el camino de recuperación si perdió el enlace del alta. ⚠ Al ser una
  URL «quien la abre se la guarda en su Google Wallet», devuélvela sólo a
  ese cliente autenticado. **Tarjeta `apple` (v1.7): `null` siempre.**
- `usuario.sistema` (v1.7): `"google"` \| `"apple"`.
- `usuario.googleWalletObjetoId` (v1.4): id del objeto en Google Wallet
  (`null` si nunca se generó; siempre `null` en tarjetas apple).
- `401 BAD_CREDENTIALS`.
- `403 TARJETA_INACTIVA`.
- `409 EMAIL_AMBIGUO` → el email existe en **varias filas** (varios
  comercios, o el mismo comercio con los dos sistemas): repetir la llamada
  añadiendo `comercioId` (acepta el id numérico o el `idRandomLargo`).

---

### 3.5 `POST /api/registro/tarjeta/:idRandomLargo`

Alta de cliente. **El `idRandomLargo` va en la URL** y la API deduce a qué
comercio pertenece la tarjeta.

| Body | Tipo | Req. |
|---|---|---|
| `nombre` | string (1–150) | ✅ |
| `email` | string válido | ✅ |
| `sistema` | `"google"` \| `"apple"` | ✗ (defecto `google`) — v1.7 |
| ~~`password`~~ | — | **no se envía (v1.6)**: la pone el servidor (`USUARIO_PASSWORD`). Si el body la trae, **se ignora** |

> **Contraseña (v1.6).** El servidor guarda SIEMPRE la contraseña estándar
> `USUARIO_PASSWORD` (`.env` del servidor; valor actual `123123`) y el login
> de tarjeta (§3.4) autentica con ella. El alta de usuario queda «oculta»:
> la pantalla de tarjeta se deja preparada, pero el usuario normal sólo
> interactúa con sus puntos a través de Google Wallet.

> **`sistema` (v1.7).** El front lo manda en el formulario (premarcado según
> navegador, con desplegable editable). Si falta o viene vacío ⇒ `google`
> (compatibilidad con front antiguo). Un valor distinto de `google`/`apple`
> ⇒ `400 VALIDATION`. **Los duplicados se miran por sistema**: el mismo
> email en el mismo comercio con `sistema` distinto **no choca** — son dos
> tarjetas **independientes** (fila, id y contadores propios).

`201` — **SIN `token` ni `role` (v1.6)**: el navegador que registra **NO
queda logueado** ni debe auto-redirigirse a la pantalla de usuario; la
entrada en esa pantalla es manual (§3.4, que sí devuelve token):
```json
{
  "ok": true,
  "usuario": { "id": 2, "nombre": "Luis Captura", "email": "luis.cap@ejemplo.com",
               "comercioId": 2, "sistema": "google", "puntos": 0, "premios": 0,
               "googleWalletObjetoId": "3388000000023208299.USER_2_COMERCIO_5949..." },
  "comercio": { "id": 2, "nombre": "Café Central" },
  "googleWalletUrl": "https://pay.google.com/gp/v/save/eyJhbGciOiJSUzI1NiIs..."
}
```

**Alta apple (v1.7).** Con `sistema: "apple"` la respuesta `201` cambia:
`usuario.sistema = "apple"`, **`googleWalletUrl: null`** (no se genera ni se
persiste nada de Google para esa tarjeta) y se añade
**`"mensaje": "sistema_apple"`**. Ese literal es INFORMATIVO para el front
(la lógica de Apple Wallet todavía no existe): **no hay `token`, y no debe
haber ninguna llamada ni redirección a Apple** — la siguiente fase añadirá
la lógica real.

**`googleWalletUrl`** (nuevo): enlace «Añadir a Google Wallet» de **esta** tarjeta.

- **`string`** si el comercio **ya tiene clase creada** en Google Wallet (y no
  está en `DRAFT`): el cliente debe ofrecerlo al usuario en el momento del alta
  (botón/enlace «Guardar en Google Wallet»).
- **`null`** si el comercio todavía no tiene clase creada, la clase está en
  `DRAFT` o hubo un problema de configuración: **el alta se completa igualmente**
  (no es un error; se puede mostrar «este comercio aún no tiene tarjeta en
  Google Wallet»).
- ⚠ **La URL no está vinculada a ninguna cuenta**: quien la abra se la guarda
  en **su** Google Wallet. Devuélvela **sólo** al cliente del alta: no la
  expongas en listados ni la registres en analíticas.
- **Recuperación (v1.4)**: si el usuario pierde el enlace (no lo ejecutó),
  **no hace falta re-registrarse**: el login de tarjeta (§3.4) devuelve
  `googleWalletUrl` regenerado en cada llamada. El enlace es local (JWT
  firmada por el servidor), no caduca y reemitirlo nunca crea una segunda
  tarjeta en Google (mismo `objectId`: si ya estaba guardada, Google la
  actualiza).
- **QR de la tarjeta (v1.5)**: el `barcode` QR que la tarjeta lleva en Google
  Wallet contiene **sólo el identificador numérico** de la tarjeta (p. ej.
  `7`), **nunca** la URL de captura: quien lo escanee no ve la ruta del front
  (protección de esa URL). Quien necesite la captura (el front, con su
  página exclusiva con lector de QR) construye la URL real con la base +
  ese identificador. Las tarjetas ya guardadas en el Wallet migran al
  nuevo formato solas con su **siguiente movimiento** (el `PATCH` de
  `googleWallet` de §5.4 renueva también el `barcode`).
- `usuario.googleWalletObjetoId` es el id del objeto en Google Wallet (`null`
  si no se generó enlace).

**Reanudación del alta (v1.4/v1.6).** Si el email **ya existe en ese comercio
CON EL MISMO `sistema`**:

| Situación | Respuesta |
|---|---|
| La cuenta usa la **contraseña estándar** (`USUARIO_PASSWORD`) — caso normal de todas las altas nuevas | **`201` con la misma forma que un alta nueva** (también **sin `token`**): `usuario` (la MISMA fila: id, nombre y saldos originales, sin duplicar) y `googleWalletUrl` regenerado. Caso típico: el usuario vuelve a rellenar el formulario porque no ejecutó el enlace de Google Wallet la primera vez |
| La cuenta tiene **otra contraseña** (heredada de antes del v1.6) | `400 EMAIL_DUPLICADO` (conflicto real: no se reanuda) |
| Contraseña estándar pero la tarjeta está **desactivada** | `403 TARJETA_INACTIVA` |
| Reanudación de una tarjeta **`apple`** (v1.7) | `201` sobre la MISMA fila, **sin `token`**, `googleWalletUrl: null` y `mensaje: "sistema_apple"` (no se crea fila ni se toca Google; la lógica de reanudación apple llegará en una fase posterior) |

En la reanudación **no se crea fila**, **no se tocan puntos/premios** y los
campos del formulario del reintento (p. ej. `nombre`) **se ignoran**: manda lo
que ya había en BD.

> **Email con las dos tarjetas (v1.7).** Si existe la fila `apple` y el front
> manda `sistema: "google"` (o al revés), **NO es reanudación**: es una alta
> nueva de la otra tarjeta (fila independiente con `201`).

| Error | Código | HTTP |
|---|---|---|
| Comercio inexistente en la URL | `COMERCIO_NOT_FOUND` | 400 |
| Comercio desactivado | `COMERCIO_INACTIVO` | 403 |
| Email ya registrado con contraseña distinta de la estándar (cuentas heredadas) | `EMAIL_DUPLICADO` | 400 |
| Reanudación de tarjeta desactivada | `TARJETA_INACTIVA` | 403 |
| Faltan campos / email inválido / `sistema` distinto de `google`\|`apple` | `VALIDATION` | 400 |

> Un `idRandomLargo` desconocido devuelve `400` (no `404`).

---

## 4. Endpoints de tarjeta / cliente

*Rutas: token `tarjeta` (o `admin` con `?tarjetaId=`).*

### 4.1 `GET /api/tarjeta/perfil`

```json
{
  "ok": true,
  "tarjeta": {
    "id": 2, "comercioId": 2, "nombre": "Luis Captura",
    "email": "luis.cap@ejemplo.com", "sistema": "google",
    "puntos": 5, "premios": 2,
    "activo": 1, "createdAt": "2026-09-23T06:53:26.000Z", "updatedAt": null,
    "googleWalletObjetoId": null
  }
}
```
Admin: `GET /api/tarjeta/perfil?tarjetaId=2`. Sin `tarjetaId` → `400 TARJETA_REQUERIDA`.
> `googleWalletObjetoId` es `null` cuando la tarjeta no tiene enlace de Google
> Wallet. **El enlace en sí NO está aquí** (sólo se devuelve en el registro).

### 4.2 `GET /api/tarjeta/operaciones?limite=100`

Historial propio (más recientes primero).

```json
{
  "ok": true,
  "total": 4,
  "operaciones": [
    { "id": 8, "tarjetaId": 2, "comercioId": 2, "tipo": "canje",
      "puntosDelta": 0, "premiosDelta": -1, "descripcion": null,
      "nombre": null, "codigoCamarero": null,
      "createdAt": "2026-09-23T06:53:28.000Z" }
  ]
}
```
> No incluye `idempotenciaKey` (eso sólo lo ve admin).

---

## 5. Endpoints de comercio

*Rutas: token `comercio` u `operario` (o `admin` + `comercioId`), salvo donde
se indique otro rol. **Se exige `activo = 1` en todas**. Alcance del
`operario` (v1.8): **sólo §5.3 y §5.4**; el resto → `403 FORBIDDEN_ROLE`.*

### 5.1 `GET /api/comercio/perfil`

*(rol `comercio` o `admin`)*

```json
{
  "ok": true,
  "comercio": { "id": 2, "nombre": "Café Central",
    "nombreUsuario": "cafe_central",
    "puntosPremio": 10,
    "premioDescripcion": "Café gratis", "activo": 1,
    "idRandomLargo": "5949aef4b6e7e66be2a4c04e0a723c92d618d6e3bcac6b43",
    "createdAt": "2026-09-23T06:53:26.000Z",
    "googleWalletClaseId": "3388000000023208299.5949aef4b6e7e66be2a4c04e0a723c92d618d6e3bcac6b43",
    "googleWalletClaseEstado": "UNDER_REVIEW" }
}
```
> **No incluye `passwordHash` ni `operarioHash`** (ninguna contraseña sale
> nunca en una respuesta). El `idRandomLargo` se muestra aquí para que el
> comercio pueda generar su QR de alta.
> `googleWalletClaseId` / `googleWalletClaseEstado` son `null` **mientras no se
> haya creado la clase de Google Wallet** para ese comercio (§7.9).

### 5.2 `GET /api/comercio/tarjetas`

*(rol `comercio` o `admin` — el operario NO llega: `403`)*

Todas las tarjetas del comercio (sin paginación, sin filtros).

```json
{ "ok": true, "total": 1, "tarjetas": [ { "id": 2, "comercioId": 2, "nombre": "Luis Captura",
    "email": "luis.cap@ejemplo.com", "sistema": "google", "puntos": 5, "premios": 2, "activo": 1,
    "createdAt": "...", "updatedAt": "...", "googleWalletObjetoId": null } ] }
```

### 5.3 `GET /api/comercio/tarjetas/:id`

*(rol `comercio`, `operario` o `admin`)*

Misma forma que 5.2 pero `"tarjeta": {...}`.
Si la tarjeta no existe **o pertenece a otro comercio** → `404 TARJETA_NOT_FOUND`
(mismo código en ambos casos: no conviene distinguirlos en la interfaz).
Es el punto de lectura de la **tarjeta escaneada** para el operario.

### 5.4 `POST /api/comercio/tarjetas/:id/movimiento` ⭐

*(rol `comercio`, `operario` o `admin` — el operario sólo puede llegar aquí
para las tarjetas de SU comercio; mismas reglas de movimiento para ambos)*

Endpoint central: mueve puntos/premios **y** registra la operación, de forma
atómica e idempotente.

**Body**

| Campo | Tipo | Req. | Notas |
|---|---|---|---|
| `puntosDelta` | entero con signo | ✅ | `0` si no toca puntos |
| `premiosDelta` | entero con signo | ✅ | `0` si no toca premios |
| `tipo` | string | ✗ | `acumulacion` \| `canje` \| `correccion` \| `ajuste`. Si falta, se deduce |
| `descripcion` | string ≤255 | ✗ | |
| `nombre` | string | ✗**/ver §6** | camarero / persona |
| `codigoCamarero` | string | ✗**/ver §6** | va en mayúsculas en el registro |
| `idempotencia` | string ≤64 | ✗pero **recomendado** | o cabecera `Idempotency-Key` |

También se acepta `comercioId` en el body **sólo si el token es de admin**.

**Cabecera opcional:** `Idempotency-Key: <clave>` (si no se manda `idempotencia` en el body).

**`201` — movimiento aplicado**
```json
{
  "ok": true,
  "duplicado": false,
  "idOperacion": 5,
  "idConversion": 6,
  "conversion": { "n": 2, "umbral": 10, "puntosDescontados": 20 },
  "requiereNombre": false,
  "googleWallet": "sincronizado",
  "tarjeta": { "id": 2, "comercioId": 2, "nombre": "Luis Captura",
    "email": "luis.cap@ejemplo.com", "puntos": 5, "premios": 2, "activo": 1,
    "createdAt": "...", "updatedAt": "..." }
}
```
- **`tarjeta` es el saldo ya actualizado**: el cliente debe refrescar su estado
  con este objeto, sin necesidad de otra llamada.
- **`googleWallet`** (v1.3) es el resultado de llevar esos saldos a Google
  Wallet **después** de aplicar el movimiento. Siempre está presente
  (también en el `200` de duplicado):

  | Valor | Significado | Sugerencia de interfaz |
  |---|---|---|
  | `"sincronizado"` | Google confirmó el PATCH de los saldos | Nada que hacer |
  | `"sin_objeto"` | La tarjeta tiene enlace pero el usuario **aún no la ha guardado** en su Wallet (Google devuelve 404) | Nada que hacer (es lo normal hasta que la guarde) |
  | `"error"` | Google no respondió / falló. **El movimiento en nuestra BD sí se aplicó** (fuente de verdad) | Aviso discreto: «Guardado; reintentaremos la sincronización con Google Wallet». El próximo movimiento (o un reintento idempotente) la pone al día |
  | `"sistema_apple"` | v1.7: la tarjeta es **apple**: **no se llama a Google** (no existe allí). El movimiento sí se aplicó en la BD | Sólo informativo; **no** mostrar nada de Google. La lógica de Apple llegará en una fase posterior |
  | `null` | La tarjeta **no tiene enlace** de Google Wallet (nunca se generó) | No mostrar nada |

  ⚠ **Nunca** se debe bloquear ni reintentar el movimiento por este campo: la
  BD local es siempre la fuente de verdad.
- `conversion` no es `null` cuando la acumulación desencadenó canje automático:
  `n` = premios ganados, `umbral` = `puntosPremio` del comercio,
  `puntosDescontados` = `n * umbral`. En ese caso `idConversion` es el id de la
  segunda operación registrada (`tipo: "canje_automatico"`).
- `requiereNombre` indica si el servidor consideró la operación «no estándar».

**`200` — reintento de una operación ya aplicada (mismo `idempotencia`)**
```json
{
  "ok": true,
  "duplicado": true,
  "mensaje": "Operación ya registrada previamente: no se ha aplicado de nuevo",
  "idOperacion": 5,
  "operacion": { "id": 5, "tarjetaId": 2, "comercioId": 2, "tipo": "acumulacion",
    "puntosDelta": 25, "premiosDelta": 0, "descripcion": "3 desayunos",
    "nombre": null, "codigoCamarero": null,
    "createdAt": "2026-09-23T06:53:27.000Z" },
  "tarjeta": { "...saldo actual...": "..." },
  "historial": [ { "...": "..." } ]
}
```
Tratar `201` y `200` como **éxito**; con `duplicado: true` mostrar el resultado
original (no repetir la animación de «sumado otra vez»).

**Errores específicos**

| Código | HTTP | Cuándo |
|---|---|---|
| `VALIDATION` | 400 | `puntosDelta`/`premiosDelta` no son enteros, ambos `0`… |
| `SIN_EFECTO` | 400 | los dos deltas son `0` |
| `TIPO_INVALIDO` | 400 | `tipo` fuera del enum permitido |
| `NOMBRE_REQUERIDO` | 400 | operación no estándar sin `nombre` |
| `CODIGO_CAMARERO_REQUERIDO` | 400 | operación no estándar sin `codigoCamarero` |
| `CODIGO_CAMARERO_INVALIDO` | 400 | el código no está en la lista permitida |
| `PREMIOS_NEGATIVOS` | 400 | el canje dejaría los premios en negativo |
| `PUNTOS_NEGATIVOS` | 400 | el ajuste dejaría los puntos en negativo |
| `IDEMPOTENCIA_CONFLICTO` | **409** | misma clave con contenido distinto |
| `TARJETA_NOT_FOUND` | 404 | tarjeta inexistente o de otro comercio |
| `TARJETA_INACTIVA` | 403 | tarjeta desactivada |
| `COMERCIO_INACTIVO` | 403 | comercio desactivado |
| `COMERCIO_REQUERIDO` | 400 | admin sin `comercioId` |
| `UNAUTHORIZED` / `INVALID_TOKEN` | 401 | sin token o caducado |
| `FORBIDDEN_ROLE` | 403 | rol equivocado |

---

### 5.5 `PATCH /api/comercio/password`

El comercio autenticado cambia **su propia** contraseña.

**Body**

| Campo | Tipo | Req. | Notas |
|---|---|---|---|
| `passwordActual` | string | ✅ | debe coincidir con la actual |
| `passwordNueva` | string | ✅ | mínimo `MIN_PASSWORD_ADMIN` (8) |

```json
{ "passwordActual": "Comercio123", "passwordNueva": "NuevaClave123" }
```

**`200`**
```json
{ "ok": true }
```

- Sólo rol **`comercio`**: ni el `admin` ni el `operario` llegan (`403
  FORBIDDEN_ROLE`). Para restablecer credenciales desde fuera, el admin usa
  `PATCH /api/admin/comercios/:id` con `{ password }` (contraseña de comercio)
  **o** `{ operarioPassword }` (contraseña de operario).
- **Errores**: `400 VALIDATION` (faltan campos o `passwordNueva` < 8),
  **`400 PASSWORDS_IGUALES`** (v1.9: `passwordNueva` == contraseña de
  operario del comercio), `401 PASSWORD_ACTUAL_INCORRECTA`, `401` sin token,
  `403 COMERCIO_INACTIVO`.
- Al cambiarla deja de valer la anterior en todos los logins de ese
  comercio (los tokens ya emitidos siguen siendo válidos hasta expirar).
  Cambia **sólo** la del comercio: la de operario es otra contraseña aparte.

### 5.6 `PATCH /api/comercio/operario-password` ⭐ (nuevo en v1.9)

Cambia la **contraseña de operario/camarero** del comercio. Roles
permitidos: **`comercio`** y **`admin`** (§5 header; `operario` → `403
FORBIDDEN_ROLE`: nadie cambia su propia contraseña de operario desde aquí).

**Body — rol `comercio`**

| Campo | Tipo | Req. | Notas |
|---|---|---|---|
| `passwordActual` | string | ✅ | contraseña **del comercio** (no la de operario) |
| `operarioPasswordNueva` | string | ✅ | mínimo `MIN_PASSWORD_ADMIN` (8) |
| `operarioPasswordConfirmacion` | string | ✅ | debe coincidir con la anterior |

**Body — rol `admin`**: `{ operarioPasswordNueva }` + `comercioId`
obligatorio (query o body, como el resto de rutas de comercio del admin).

```json
{ "passwordActual": "Comercio123",
  "operarioPasswordNueva": "OperarioNuevo9",
  "operarioPasswordConfirmacion": "OperarioNuevo9" }
```

**`200`**
```json
{ "ok": true }
```

- **El comercio nunca teclea la contraseña antigua de operario** (no la
  conoce ni necesita): la garantía es su propia `passwordActual`.
- **Errores**: `400 VALIDATION` (faltan campos, `operarioPasswordNueva` < 8
  **o** la confirmación no coincide), **`400 PASSWORDS_IGUALES`** (la nueva
  == contraseña de comercio del comercio), `401
  PASSWORD_ACTUAL_INCORRECTA` (rol `comercio`), `400 COMERCIO_REQUERIDO`
  (rol `admin` sin `comercioId`), `401` sin token, `403 COMERCIO_INACTIVO`,
  `403 FORBIDDEN_ROLE` (rol `operario` o `tarjeta`).
- La contraseña de operario anterior deja de valer en el login
  **inmediatamente** (los JWT de operario ya emitidos caducan solos).

---

## 6. Reglas del movimiento (lo que el cliente debe reflejar)

1. **Deltas enteros.** Un decimal produce `400 VALIDATION`.
2. **Canje automático de puntos.** Si `puntosDelta > 0` y los nuevos puntos
   alcanjan `puntosPremio` del comercio, la API descuenta `n * puntosPremio`
   y suma `n` premios (`n = floor(puntos / puntosPremio)`), registrando además
   una operación `tipo: "canje_automatico"` con `nombre: "sistema"`.
   El cliente **no** debe calcular ni replicar esta conversión: debe leer
   `tarjeta` de la respuesta.
3. **Premios nunca en negativo** (idem puntos): la petición se rechaza, no
   hace «clip» a 0.
4. **Operación estándar vs. no estándar** (cuándo enviar `nombre` + `codigoCamarero`):

   | Movimiento | Estándar | `nombre`/`codigoCamarero` |
   |---|---|---|
   | Sumar puntos por debajo del umbral | ✅ | opcionales |
   | Restar premios (canjear) | ✅ | opcionales |
   | Sumar premios a mano (`premiosDelta > 0`) | ❌ | **obligatorios** |
   | Restar puntos (`puntosDelta < 0`) | ❌ | **obligatorios** |
   | Sumar más de `UMBRAL_PUNTOS_NOMBRE` puntos (100 por defecto) | ❌ | **obligatorios** |

   Si el servidor rechaza con `NOMBRE_REQUERIDO` / `CODIGO_CAMARERO_REQUERIDO`,
   el cliente debe pedir los datos y reenviar **la misma** `idempotencia`.
   En operaciones estándar `nombre` queda `null`: no hay que rellenarlo.
5. **Tipos** (si el cliente no envía `tipo`, la API lo deduce):

   | `tipo` | Significado | Deducción automática |
   |---|---|---|
   | `acumulacion` | sumar puntos | `puntosDelta > 0` |
   | `canje` | canjear premios | `premiosDelta < 0` y `puntosDelta = 0` |
   | `correccion` | ajuste manual | `premiosDelta > 0` o `puntosDelta < 0` |
   | `ajuste` | sólo si se envía explícitamente | — |
   | `canje_automatico` | generado por el servidor | — (sólo lectura) |

6. **Los saldos son autoritativos en la respuesta**: `tarjeta.puntos` y
   `tarjeta.premios` tras el movimiento.

### Idempotencia (obligatoria en la práctica)

Motivo: si la red falla al confirmar, el reintento **no debe** duplicar el movimiento.

| Situación | Respuesta |
|---|---|
| Misma clave, mismo contenido, primera vez | `201`, `duplicado: false` |
| Misma clave, mismo contenido, reintento | `200`, `duplicado: true`, sin aplicar de nuevo |
| Misma clave, contenido distinto | `409 IDEMPOTENCIA_CONFLICTO` |
| Sin clave | se aplica siempre (sin protección) |

**Recomendación de uso:** generar un UUID v4 en el cliente **en el momento en
que el usuario confirma** la acción, guardarlo en la petición, y reutilizarlo
en todos los reintentos de esa misma acción. Sólo se genera uno nuevo cuando
el usuario lanza una acción nueva. Máx. 64 caracteres.

La comprobación se hace **antes** que las validaciones de contenido: un
reintento devuelve el resultado original aunque el resto de la petición
hubiera cambiado levemente (si cambian los deltas → `409`).

---

## 7. Endpoints de administrador

*Sólo token `admin`.*

### 7.1 `GET /api/admin/comercios`

```json
{ "ok": true, "total": 1, "comercios": [
  { "id": 2, "nombre": "Café Central", "nombreUsuario": "cafe_central",
    "puntosPremio": 10,
    "premioDescripcion": "Café gratis", "activo": 1,
    "idRandomLargo": "5949...", "createdAt": "...", "updatedAt": null,
    "googleWalletClaseId": "3388000000023208299.5949...",
    "googleWalletClaseEstado": "UNDER_REVIEW" } ] }
```
> `nombreUsuario` es `null` en los comercios heredados que aún no lo tienen
> relleno (no pueden loguear). **Nunca** aparecen `passwordHash` ni
> `operarioHash`.

### 7.2 `GET /api/admin/comercios/:id` → `{ ok, comercio }` · `404 COMERCIO_NOT_FOUND`

*(incluye también `nombreUsuario`, `googleWalletClaseId`,
`googleWalletClaseEstado` y `googleWalletClaseCreadaEn`)*

### 7.3 `POST /api/admin/comercios`

| Body | Tipo | Req. |
|---|---|---|
| `nombre` | string | ✅ |
| `nombreUsuario` | string 3–32, `[a-z0-9_]` (se guarda en minúsculas) | ✅ — v1.8 |
| `password` | string, **mínimo 8** | ✅ (contraseña del comercio) |
| `operarioPassword` | string, **mínimo 8** | ✅ — v1.8 (contraseña de operario/camarero) |
| `puntosPremio` | entero > 0 | ✗ (defecto 10) |
| `premioDescripcion` | string | ✗ |
| `activo` | booleano | ✗ (defecto `true`) |

`201 { ok, comercio }` con el `idRandomLargo` **recién generado** (mostrarlo/guardarlo
para el QR del comercio). La respuesta incluye `nombreUsuario` y **ningún
hash**. Errores: `400 COMERCIO_DUPLICADO` (nombre repetido),
`400 USUARIO_DUPLICADO` (`nombreUsuario` ya usado por otro comercio),
**`400 PASSWORDS_IGUALES`** (`password` == `operarioPassword`), `400
VALIDATION` (faltan campos, formato de usuario inválido o contraseñas
< 8).

### 7.4 `PATCH /api/admin/comercios/:id`

Actualización parcial: cualquiera de los campos de 7.3 — `password` cambia la
contraseña del comercio, **`operarioPassword`** la de operario y
**`nombreUsuario`** el usuario de login (`400 USUARIO_DUPLICADO` si lo usa
otro comercio). Sin campos → `400 VALIDATION`. Devuelve `{ ok, comercio }` con
`updatedAt` refrescado y **sin hashes**.

- **v1.9 — `400 PASSWORDS_IGUALES`**: la nueva contraseña de comercio no
  puede coincidir con la de operario guardada (ni viceversa; y si llegan las
  dos en el mismo PATCH, tampoco entre sí). Alternativa al alta/edición:
  `PATCH /api/comercio/operario-password` (§5.6).

> Es el camino para **rellenar los comercios heredados** que quedaron con
> `nombreUsuario: null` en la migración v1.8: hasta que no tengan usuario y
> contraseña, esos comercios no pueden iniciar sesión (§3.3).

### 7.5 `GET /api/admin/tarjetas?comercioId=`

Filtro opcional. Igual que 7.1 pero con `tarjetas` (cada objeto incluye
también `sistema` — v1.7: `google` \| `apple`).

### 7.6 `GET /api/admin/tarjetas/:id` → `{ ok, tarjeta }` · `404 TARJETA_NOT_FOUND`

### 7.7 `GET /api/admin/operaciones`

**Query**

| Parámetro | Tipo | Notas |
|---|---|---|
| `comercioId` | entero | opcional |
| `tarjetaId` | entero | opcional |
| `tipo` | string | `acumulacion` \| `canje` \| `correccion` \| `ajuste` \| `canje_automatico` |
| `desde` / `hasta` | string | se comparan con `createdAt`; formato recomendado `YYYY-MM-DD HH:MM:SS` (amplía el rango si hay dudas de zona horaria) |
| `pagina` | entero ≥1 | defecto 1 |
| `tamano` | entero 1–200 | defecto 50 |

```json
{
  "ok": true, "total": 4, "pagina": 1, "tamano": 10,
  "filas": [
    { "id": 8, "tarjetaId": 2, "comercioId": 2, "tipo": "canje",
      "puntosDelta": 0, "premiosDelta": -1, "descripcion": null,
      "nombre": null, "codigoCamarero": null, "idempotenciaKey": "cap-005",
      "createdAt": "2026-09-23T06:53:28.000Z",
      "tarjetaNombre": "Luis Captura", "tarjetaEmail": "luis.cap@ejemplo.com",
      "comercioNombre": "Café Central" }
  ]
}
```
`total` es el total **sin paginar**; `filas` es la página actual.
Orden: descendente por fecha.

### 7.8 El admin en rutas de comercio/tarjeta

```http
GET /api/comercio/tarjetas?comercioId=2          con token admin   → 200
GET /api/comercio/tarjetas                        con token admin   → 400 COMERCIO_REQUERIDO
GET /api/tarjeta/perfil?tarjetaId=2               con token admin   → 200
GET /api/admin/operaciones                        con token comercio→ 403 FORBIDDEN_ROLE
```

### 7.9 `POST /api/admin/comercios/:idRandomLargo/google-wallet/clase` ⭐

Alta de la **CLASE** (plantilla del comercio) en Google Wallet. Crea UNA SOLA
CLASE por comercio: todas sus futuras tarjetas de Google Wallet apuntarán a ella.
**No crea tarjetas/objetos individuales** (eso no existe todavía).

- **Rol:** sólo `admin`.
- **URL:** el `:idRandomLargo` debe corresponder a un comercio existente. Es
  además el **sufijo de la clase**: `classId = <GOOGLE_WALLET_ISSUER_ID>.<idRandomLargo>`.

**Body**

| Campo | Tipo | Req. | Notas |
|---|---|---|---|
| `imgLogo` | URL **HTTPS** pública | ✅ | logo del programa |
| `imgHero` | URL **HTTPS** pública | ✗ | banner grande de la tarjeta |
| `imgModulo` | URL **HTTPS** pública | ✗ | foto del módulo de imagen |
| `hexBackgroundColor` | `#rgb` \| `#rrggbb` | ✗ | **Si NO se envía, el campo se omite y Google usa el color dominante de `imgHero`** (omitirlo nunca da error) |
| `terminosTexto` | string ≤1000 | ✅ | cuerpo del bloque «Términos» (el título «Términos» es fijo) |
| `reviewStatus` | `DRAFT` \| `UNDER_REVIEW` | ✗ (defecto `UNDER_REVIEW`) | `DRAFT` = en diseño, aún no admite tarjetas |

Valores derivados automáticamente (no se envían): `issuerName` = nombre del
comercio; `programName` = `"Fidelización " + nombre`.

**`201` — clase creada**
```json
{
  "ok": true,
  "clase": {
    "id": "3388000000023208299.5949aef4b6e7e66be2a4c04e0a723c92d618d6e3bcac6b43",
    "reviewStatus": "UNDER_REVIEW",
    "issuerName": "Café Central",
    "programName": "Fidelización Café Central"
  },
  "comercio": { "id": 2, "...": "...", "googleWalletClaseId": "3388000000023208299.5949...",
                "googleWalletClaseEstado": "UNDER_REVIEW" }
}
```
El id queda guardado en el comercio: se puede leer después con
`GET /api/admin/comercios/:id` o `GET /api/comercio/perfil`.

**Errores específicos**

| Código | HTTP | Cuándo / acción |
|---|---|---|
| `GOOGLE_CLASE_YA_EXISTE` | **409** | La clase ya estaba creada en Google. El `message` incluye el id y el estado. **El formulario debe informar de este conflicto** y, si procede, ofrecer «ya existe» en lugar de reintentar |
| `VALIDATION` | 400 | Falta `imgLogo`/`terminosTexto`, URL no HTTPS, color mal formado, `reviewStatus` fuera del enum |
| `COMERCIO_NOT_FOUND` | 404 | El `idRandomLargo` de la URL no corresponde a ningún comercio |
| `GOOGLE_WALLET_400` | 400 | Google rechazó los datos (p. ej. `issuerName` demasiado largo); `message` con el detalle de Google |
| `GOOGLE_WALLET_PERMISOS` | 502 | La service account no tiene el rol GCP «Wallet Object Issuer» |
| `GOOGLE_WALLET_AUTH` | 502 | Google rechazó la autenticación |
| `GOOGLE_WALLET_INDISPONIBLE` | 502 | Google no responde / error no previsto → reintentar |
| `GOOGLE_WALLET_SIN_CONFIG` | 503 | Falta configuración en el servidor |
| `UNAUTHORIZED` / `INVALID_TOKEN` | 401 | sin token o caducado |
| `FORBIDDEN_ROLE` | 403 | rol distinto de `admin` |

> `clase.reviewStatus` es el estado **real** que devuelve Google (p. ej.
> `approved`, que puede diferir de lo que se envió). El valor guardado en
> `googleWalletClaseEstado` es ese mismo estado real, leído en cada alta.

> **No existe** (todavía) ningún endpoint para crear ni editar la clase en
> Google (PATCH), ni para crear las instancias/tarjetas individuales.

---

## 8. Índice de `error.code`

| Code | HTTP | Significado / acción sugerida |
|---|---|---|
| `VALIDATION` | 400 | Mostrar `message` tal cual (incluye `sistema` distinto de `google`\|`apple` y `nombreUsuario` con formato inválido) |
| `SIN_EFECTO` | 400 | La operación no cambia nada |
| `TIPO_INVALIDO` | 400 | Corregir el enum |
| `NOMBRE_REQUERIDO` | 400 | Pedir nombre de camarero y reenviar |
| `CODIGO_CAMARERO_REQUERIDO` | 400 | Pedir código y reenviar |
| `CODIGO_CAMARERO_INVALIDO` | 400 | Código no autorizado |
| `PREMIOS_NEGATIVOS` | 400 | Canje superior a lo disponible |
| `PUNTOS_NEGATIVOS` | 400 | Descuento superior a lo disponible |
| `COMERCIO_NOT_FOUND` | 400/404 | URL de registro inválida / recurso no existe |
| `COMERCIO_DUPLICADO` | 400 | Nombre de comercio ya usado |
| `USUARIO_DUPLICADO` | 400 | `nombreUsuario` ya usado por otro comercio (alta o PATCH) |
| `PASSWORDS_IGUALES` | 400 | La contraseña de comercio y la de operario no pueden ser iguales (v1.9) |
| `COMERCIO_REQUERIDO` | 400 | Admin sin `comercioId` |
| `TARJETA_REQUERIDA` | 400 | Admin sin `tarjetaId` |
| `EMAIL_DUPLICADO` | 400 | Registro repetido en ese comercio **con otra contraseña** (misma contraseña ⇒ reanudación `201`, ver §3.5) |
| `UNAUTHORIZED` | 401 | Falta token → login |
| `INVALID_TOKEN` | 401 | Token caducado/inválido → login |
| `BAD_CREDENTIALS` | 401 | Usuario o contraseña incorrectos |
| `PASSWORD_ACTUAL_INCORRECTA` | 401 | `PATCH /api/comercio/password`: la contraseña actual no coincide |
| `FORBIDDEN_ROLE` | 403 | Rol equivocado para esa ruta |
| `COMERCIO_INACTIVO` | 403 | Cuenta de comercio desactivada |
| `TARJETA_INACTIVA` | 403 | Tarjeta desactivada |
| `TARJETA_NOT_FOUND` | 404 | No existe o no pertenece al comercio |
| `NOT_FOUND` | 404 | Recurso genérico |
| `EMAIL_AMBIGUO` | 409 | Repetir login con `comercioId` (varios comercios, o mismo comercio con los dos `sistema`) |
| `IDEMPOTENCIA_CONFLICTO` | 409 | Clave de idempotencia reutilizada con otros datos |
| `GOOGLE_CLASE_YA_EXISTE` | 409 | La clase de Google Wallet ya existe; informar al usuario |
| `DUPLICATE` | 409 | Clave única duplicada (carrera) |
| `ROUTE_NOT_FOUND` | 404 | URL incorrecta |
| `INTERNAL` | 500 | Reintentar / avisar |
| `GOOGLE_WALLET_PERMISOS` | 502 | Service account sin rol «Wallet Object Issuer» (problema del servidor) |
| `GOOGLE_WALLET_AUTH` | 502 | Google rechazó la autenticación (problema del servidor) |
| `GOOGLE_WALLET_INDISPONIBLE` | 502 | Google no responde → se puede reintentar |
| `GOOGLE_WALLET_SIN_CONFIG` | 503 | Falta `.env` de Google Wallet (problema del servidor) |
| `COMERCIO_NOT_FOUND` (registro) | 400 | `idRandomLargo` desconocido |

---

## 9. Catálogo completo de endpoints

| # | Método | Ruta | Rol |
|---|---|---|---|
| 1 | GET | `/health` | público |
| 2 | POST | `/api/auth/admin/login` | público |
| 3 | POST | `/api/auth/comercio/login` | público |
| 4 | POST | `/api/auth/tarjeta/login` | público |
| 5 | POST | `/api/registro/tarjeta/:idRandomLargo` | público |
| 6 | GET | `/api/tarjeta/perfil` | tarjeta / admin |
| 7 | GET | `/api/tarjeta/operaciones` | tarjeta / admin |
| 8 | GET | `/api/comercio/perfil` | comercio / admin |
| 9 | GET | `/api/comercio/tarjetas` | comercio / admin |
| 10 | GET | `/api/comercio/tarjetas/:id` | comercio / **operario** / admin |
| 11 | POST | `/api/comercio/tarjetas/:id/movimiento` | comercio / **operario** / admin |
| 12 | PATCH | `/api/comercio/password` | comercio |
| 13 | PATCH | `/api/comercio/operario-password` | comercio / admin |
| 14 | GET | `/api/admin/comercios` | admin |
| 15 | GET | `/api/admin/comercios/:id` | admin |
| 16 | POST | `/api/admin/comercios` | admin |
| 17 | PATCH | `/api/admin/comercios/:id` | admin |
| 18 | GET | `/api/admin/tarjetas` | admin |
| 19 | GET | `/api/admin/tarjetas/:id` | admin |
| 20 | GET | `/api/admin/operaciones` | admin |
| 21 | POST | `/api/admin/comercios/:idRandomLargo/google-wallet/clase` | admin |

> **Rol `operario` (v1.8): sólo las filas 10 y 11** además de las públicas.
> Cualquier otra fila → `403 FORBIDDEN_ROLE`.

---

## 10. Lo que NO existe (no implementarlo en el cliente)

- ❌ `DELETE` de cualquier recurso (ni comercios, ni tarjetas, ni operaciones).
- ❌ Edición de tarjetas (nombre, email, password, activo): **sólo lectura**.
- ❌ Activar/desactivar una tarjeta.
- ❌ Recuperación / reseteo de contraseña por email.
- ❌ Cambio de contraseña desde el cliente.
- ❌ Logout en servidor ni refresh token.
- ❌ Registro público de comercios (sólo admin).
- ❌ Listado público de comercios (el `idRandomLargo` llega por QR/enlace).
- ❌ Búsqueda con texto libre, filtros de tarjetas por nombre/email (sólo
  `comercioId` en admin), ni paginación en `/api/comercio/tarjetas`.
- ❌ Edición o borrado de operaciones (el libro de movimientos es inmutable).
- ❌ Endpoints de ficheros, notificaciones push, websockets o webhooks.
- ❌ **Google Wallet**: no existe creación de **instancias/tarjetas** (objetos
  individuales), ni `PATCH`/`DELETE` de una clase, ni endpoint de lectura de
  clases. Sólo existe el alta de **clase** (§7.9).
- ❌ **Apple Wallet**: **no existe ninguna lógica de Apple** (v1.7 es sólo
  información: `mensaje: "sistema_apple"` en el registro y
  `googleWallet: "sistema_apple"` en el movimiento). No hay endpoints,
  llamadas ni redirecciones a Apple. También está descartado el endpoint
  `PATCH .../sistema` (cambiar el sistema de una tarjeta ya dada de alta).
- ❌ **Login de comercio con `idRandomLargo` o `nombre`** (v1.8): el único
  camino es `nombreUsuario` + `password` (§3.3).
- ❌ **Cambiar la contraseña de operario**: el operario NO puede cambiarla
  (ni la suya ni ninguna). Sí la puede cambiar el comercio con
  `PATCH /api/comercio/operario-password` (§5.6) o el admin con ese mismo
  endpoint o con `PATCH /api/admin/comercios/:id` (§7.4).

---

## 11. Ejemplos `curl`

```bash
BASE=http://localhost:3000

# Login admin
curl -s -X POST $BASE/api/auth/admin/login \
  -H "Content-Type: application/json" \
  -d '{"nombre":"admin","password":"..."}'

# Login comercio u operario (la password decide el rol)
curl -s -X POST $BASE/api/auth/comercio/login \
  -H "Content-Type: application/json" \
  -d '{"nombreUsuario":"cafe_central","password":"..."}'

# Crear comercio (password = comercio; operarioPassword = camarero; NO pueden ser iguales)
curl -s -X POST $BASE/api/admin/comercios \
  -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"nombre":"Café Central","nombreUsuario":"cafe_central","password":"...","operarioPassword":"...","puntosPremio":10,"premioDescripcion":"Café gratis"}'

# Cambiar la contraseña de operario (desde el comercio, con SU contraseña)
curl -s -X PATCH $BASE/api/comercio/operario-password \
  -H "Content-Type: application/json" -H "Authorization: Bearer $COMERCIO_TOKEN" \
  -d '{"passwordActual":"...","operarioPasswordNueva":"...","operarioPasswordConfirmacion":"..."}'

# Lo mismo desde admin (sin passwordActual; comercioId obligatorio)
curl -s -X PATCH "$BASE/api/comercio/operario-password?comercioId=2" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"operarioPasswordNueva":"..."}'

# Alta de cliente (idRandomLargo en la URL; sistema opcional: google|apple)
curl -s -X POST $BASE/api/registro/tarjeta/$ID_RANDOM \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Luis","email":"luis@x.com","sistema":"google"}'

# Acumular puntos con idempotencia
curl -s -X POST $BASE/api/comercio/tarjetas/2/movimiento \
  -H "Content-Type: application/json" -H "Authorization: Bearer $COMERCIO_TOKEN" \
  -H "Idempotency-Key: 6f1c1f3e-6f3a-4a1e-9d3a-1a2b3c4d5e6f" \
  -d '{"puntosDelta":25,"premiosDelta":0,"descripcion":"3 desayunos"}'

# Canje de premios
curl -s -X POST $BASE/api/comercio/tarjetas/2/movimiento \
  -H "Content-Type: application/json" -H "Authorization: Bearer $COMERCIO_TOKEN" \
  -H "Idempotency-Key: 8a2d4b7c-1111-4444-8888-9999aaaabbbb" \
  -d '{"puntosDelta":0,"premiosDelta":-1,"tipo":"canje"}'

# Corrección manual de premios (exige nombre + camarero)
curl -s -X POST $BASE/api/comercio/tarjetas/2/movimiento \
  -H "Content-Type: application/json" -H "Authorization: Bearer $COMERCIO_TOKEN" \
  -H "Idempotency-Key: 9b3e5d8f-2222-4444-8888-ccccccddeeee" \
  -d '{"puntosDelta":0,"premiosDelta":1,"nombre":"Ana","codigoCamarero":"ANA-01","tipo":"correccion"}'

# Operaciones con filtros y paginación
curl -s "$BASE/api/admin/operaciones?comercioId=2&pagina=1&tamano=20" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Crear la CLASE de Google Wallet de un comercio
curl -s -X POST $BASE/api/admin/comercios/$ID_RANDOM/google-wallet/clase \
  -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"imgLogo":"https://ejemplo.com/logo.png",
       "imgHero":"https://ejemplo.com/hero.png",
       "imgModulo":"https://ejemplo.com/foto.png",
       "hexBackgroundColor":"#0B57D0",
       "terminosTexto":"1 punto por cada 1 € comprado.",
       "reviewStatus":"UNDER_REVIEW"}'
```

---

## 12. Comprobación previa a integrar

- [ ] `GET /health` → `{"ok":true,"db":"conectada"}`.
- [ ] Los tres logins devuelven `token` y `role`.
- [ ] Un token de comercio con `activo=0` recibe `403 COMERCIO_INACTIVO`.
- [ ] Una misma `Idempotency-Key` reenviada devuelve `duplicado: true` y el
      saldo no cambia.
- [ ] El alta de clase de Google Wallet devuelve `201` con `clase.id`, y un
      segundo envío del mismo formulario devuelve `409 GOOGLE_CLASE_YA_EXISTE`
      (mostrar el conflicto, no reintentar en bucle).
- [ ] El registro devuelve `googleWalletUrl`: si es `string`, ofrecer «Guardar
      en Google Wallet» al usuario; si es `null`, completar el alta sin más.
- [ ] El movimiento devuelve `googleWallet`: `sincronizado`/`sin_objeto` no
      requieren nada; `error` avisa sin reintentar el movimiento (la BD ya está
      bien); `null` = la tarjeta no tiene enlace (no mostrar nada).
- [ ] Reenviar el formulario de alta con **el mismo email y la misma
      contraseña** devuelve `201` (reanudación) y NO el error «email ya
      registrado»: tratarlo como alta exitosa. `EMAIL_DUPLICADO` ahora sólo
      aparece con contraseña distinta (ajustar el texto del mensaje).
- [ ] El formulario de alta **no pide contraseña** (si la manda, el servidor
      la ignora: manda `USUARIO_PASSWORD`, valor actual `123123`). El login
      de tarjeta autentica con esa contraseña estándar.
- [ ] El registro (alta **y** reanudación) **ya NO devuelve `token` ni
      `role`**: no hay auto-login ni redirección automática a la pantalla
      de usuario tras registrarse; si el usuario quiere entrar, lo hace a
      mano con el login (§3.4). No persistir nada de sesión en el navegador
      a partir de la respuesta del alta.
- [ ] `PATCH /api/comercio/password` cambia la contraseña del comercio:
      `401 PASSWORD_ACTUAL_INCORRECTA` si la actual no coincide,
      `400 VALIDATION` si la nueva es corta (< 8).
- [ ] El login de comercio manda **`nombreUsuario` + `password`** (v1.8): el
      `idRandomLargo` y el `nombre` ya **no** sirven para entrar
      (`400 VALIDATION` si falta `nombreUsuario`).
- [ ] La **misma** URL de login devuelve `role: "comercio"` o
      `role: "operario"` según la contraseña (primero se prueba la de
      operario): el front ramifica el menú con el `role` recibido.
- [ ] El token de **operario** sólo puede: leer
      `GET /api/comercio/tarjetas/:id` y mover
      `POST /api/comercio/tarjetas/:id/movimiento`. Todo lo demás
      (listado, perfil, `PATCH password`, rutas admin/tarjeta) → `403`.
- [ ] `POST /api/admin/comercios` exige **`nombreUsuario`** (único:
      `400 USUARIO_DUPLICADO`) y **`operarioPassword`** (min 8); la
      respuesta **nunca** incluye `passwordHash` ni `operarioHash`.
- [ ] `PATCH /api/admin/comercios/:id` acepta `nombreUsuario` y
      `operarioPassword` (camino para rellenar los comercios heredados con
      `null`: **mientras no tengan `nombreUsuario` no pueden loguear**).
- [ ] **v1.9**: existe `PATCH /api/comercio/operario-password` (21
      endpoints): el comercio la cambia con `{ passwordActual (SU
      contraseña), operarioPasswordNueva, operarioPasswordConfirmacion }`
      y el admin con `{ operarioPasswordNueva }` + `comercioId`; el
      `operario` recibe `403`. La vieja deja de valer al instante.
- [ ] **v1.9**: `400 PASSWORDS_IGUALES` — la contraseña de comercio y la
      de operario nunca pueden coincidir (regla en §5.5, §5.6, §7.3 y
      §7.4): si coincidieran, el login sólo daría rol `operario`.
- [ ] El login de tarjeta incluye `googleWalletUrl`: si es `string`, se puede
      ofrecer «Guardar en Google Wallet» también desde ahí; si es `null`, no
      mostrar nada.
- [ ] El QR escaneado de una tarjeta contiene **sólo su identificador**
      (`7`, no una URL): la URL de captura se arma en el lector del front
      (base + identificador).
- [ ] El registro acepta **`sistema`** (`google`/`apple`, defecto `google`;
      `400 VALIDATION` con otro valor). Con `apple`, el `201` trae
      `googleWalletUrl: null` + `mensaje: "sistema_apple"` y **sin `token`**:
      no llamar ni redirigir a Apple (fase 1: sólo informativo).
- [ ] El mismo email con **sistemas distintos** son **dos tarjetas
      independientes**: repetir el registro con el otro `sistema` es un alta
      nueva (`201`, otra fila), NO un error.
- [ ] El movimiento de una tarjeta `apple` devuelve
      `googleWallet: "sistema_apple"`: el movimiento **está aplicado** (la BD
      manda); no hay nada que sincronizar ni reintentar con Google.
- [ ] `sistema` está en `usuario` (registro y login), en el perfil y en los
      listados de tarjetas (comercio y admin).
- [ ] `error.message` se puede pintar directamente en la interfaz.
