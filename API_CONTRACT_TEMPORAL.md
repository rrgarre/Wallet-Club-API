# Wallet Club API — CONTRATO TEMPORAL v1.4 + v1.5 + v1.6 (solo cambios nuevos)

> **Fichero desechable.** Contiene ÚNICAMENTE la información que hay que
> integrar en `API_CONTRACT.md` (v1.3 → **v1.4** → **v1.5** → **v1.6**):
>
> 1. **Reanudación del registro de tarjeta** y **`googleWalletUrl` en el
>    login** (v1.4) — resuelven el callejón sin salida de «me registré, no
>    ejecuté el enlace de Google Wallet y ahora me dice que el email ya
>    está registrado».
> 2. **Cambio del contenido del QR** de la tarjeta (v1.5).
> 3. **Registro sin contraseña + endpoint de cambio de contraseña de
>    comercio** (v1.6).
>
> El contrato definitivo ya incluye todo; este fichero existe sólo para no
> tener que reenviar el documento completo al equipo de front.
>
> *(Los temporales anteriores —clase v1.1, registro v1.2, movimiento v1.3—
> ya fueron integrados.)*
> **Fecha:** 28/09/2026

---

## 1. `POST /api/registro/tarjeta/:idRandomLargo` — se puede REANUDAR

**No cambia la petición** (mismo body: `nombre`, `email`, `password`).

### Antes

| Situación | Respuesta |
|---|---|
| Email ya registrado en ese comercio | `400 EMAIL_DUPLICADO` → callejón sin salida |

### Ahora

| Situación | Respuesta |
|---|---|
| Email ya registrado **y la contraseña coincide** | **`201` con la misma forma que un alta nueva** (reanudación) |
| Email ya registrado **y la contraseña NO coincide** | `400 EMAIL_DUPLICADO` (igual que antes) |

La respuesta de reanudación es **idéntica** a la de un alta nueva
(`ok`, `token`, `role`, `usuario`, `comercio`, `googleWalletUrl`):

```json
{
  "ok": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "role": "tarjeta",
  "usuario": {
    "id": 8, "nombre": "Prueba Wallet", "email": "prueba.wallet@temp.com",
    "comercioId": 5, "puntos": 12, "premios": 3,
    "googleWalletObjetoId": "3388000000023208299.USER_8_COMERCIO_5949..."
  },
  "comercio": { "id": 5, "nombre": "Chiringuito" },
  "googleWalletUrl": "https://pay.google.com/gp/v/save/eyJhbGciOiJSUzI1NiIs..."
}
```

**Importante:**

- **No se crea una fila nueva**: `usuario.id` es el de siempre, con el mismo
  `nombre` y los **mismos puntos/premios** que ya tenía (los campos del
  formulario del reintento se ignoran).
- `googleWalletUrl` llega **regenerado** con los saldos actuales: es una JWT
  firmada por el servidor, **no caduca** y reemitirla **no** crea una segunda
  tarjeta en Google (mismo id: si el usuario ya la había guardado, Google la
  actualiza).
- Si la clase del comercio sigue sin estar aprobada, `googleWalletUrl` será
  `null` **pero el `201` sigue siendo `201`** (alta/reanudación completada).
- Caso borde: si la contraseña coincide pero la tarjeta está **desactivada**
  → `403 TARJETA_INACTIVA`.

### ⚠ Sólo hay que ajustar UN mensaje en la interfaz

El caso «mismo email + misma contraseña» que antes devolvía error **ahora
devuelve éxito**. Vuestro flujo normal de «alta correcta» ya lo trata bien
(**no hay que cambiar código**). Lo único recomendable:

- El texto de `EMAIL_DUPLICADO` ya **no** significa «ya tienes cuenta»:
  ahora significa «ese email está registrado **con otra contraseña**».
  Sugerencia de copy: *«Ya existe una cuenta con este email. ¿Es tuya?
  Prueba con tu contraseña.»*

---

## 2. `POST /api/auth/tarjeta/login` — respuesta con `googleWalletUrl`

**No cambia la petición.** Se añaden **dos campos** a la respuesta `200`:

```json
{
  "ok": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "role": "tarjeta",
  "usuario": {
    "id": 8, "nombre": "Prueba Wallet", "email": "prueba.wallet@temp.com",
    "comercioId": 5, "puntos": 12, "premios": 3,
    "googleWalletObjetoId": "3388000000023208299.USER_8_COMERCIO_5949..."
  },
  "googleWalletUrl": "https://pay.google.com/gp/v/save/eyJhbGciOiJSUzI1NiIs..."
}
```

| Campo | Tipo | Significado |
|---|---|---|
| `googleWalletUrl` | string o `null` | Enlace «Guardar en Google Wallet» **regenerado en cada login**. `null` = comercio sin clase / clase en `DRAFT` / configuración ausente |
| `usuario.googleWalletObjetoId` | string o `null` | Id del objeto en Google Wallet (sólo lectura) |

- **Opcional para vosotros**: podéis aprovechar para ofrecer el botón
  «Guardar en Google Wallet» también en la pantalla de entrada del usuario
  (es el camino natural de recuperación si perdió el enlace del alta).
  Si no queréis, **no hacéis nada** (campo nuevo, no rompe nada).
- Misma advertencia de seguridad que en el alta: la URL **no está vinculada**
  a ninguna cuenta (quien la abra se la guarda en **su** Wallet): devolverla
  sólo a ese cliente autenticado, nunca en listados ni en analíticas.

---

## 3. QR de la tarjeta: sólo el identificador (v1.5)

**Cambio de contenido, no de endpoints.** El QR (`barcode`) que cada tarjeta
lleva dentro de Google Wallet **ya no contiene la URL de captura**:

| | Antes | Ahora |
|---|---|---|
| Contenido del QR | `<FRONT_URL>/comercio/captura/7` | `7` (sólo el identificador de la tarjeta) |

**Por qué:** proteger la URL que usan los comercios — quien escanee el QR
desde cualquier parte (capturas, fotos, otros apps) **no ve la ruta** del front.

**Qué tiene que hacer el front:**

- Su **página exclusiva con lector de QR** lee el contenido del QR (un número
  o string) y **arma la URL real**: `<base>/<ruta>/<identificador-leído>`.
  El identificador que llega es el que se añade al endpoint real.
- Si ya tenían código que esperaba una URL completa dentro del QR, hay que
  ajustarlo: ahora llega **sólo el id**.

**Tarjetas ya guardadas en el Wallet** (si las hay): migran solas al nuevo
formato con su **próximo movimiento** de puntos/premios (el `PATCH` de
`googleWallet` de §5.4 renueva también el QR). No hace falta hacer nada.

---

## 4. Registro SIN contraseña + cambio de contraseña de comercio (v1.6)

### 4.1 `POST /api/registro/tarjeta/:idRandomLargo` — ya no pide contraseña

**Cambio de petición.** El body pasa a ser sólo `nombre` y `email`:

```json
{ "nombre": "Nuevo Cliente", "email": "cliente@x.com" }
```

| | Antes | Ahora |
|---|---|---|
| Body | `nombre`, `email`, `password` | `nombre`, `email` — **`password` no se envía** |
| Si el front manda `password` | se usaba para el hash | **se ignora** (no da error) |
| Hash guardado | el de la password enviada | el de la **contraseña estándar** del servidor (`USUARIO_PASSWORD`; valor actual `123123`) |
| `400 VALIDATION` por password | si faltaba o era < 6 | ya no aplica a este endpoint |

**Impacto en el front:**

- **Quitar el campo contraseña del formulario de alta** (o dejarlo: si manda
  cualquier cosa se ignora y no rompe nada).
- El **login de tarjeta** (`POST /api/auth/tarjeta/login`) autentica con esa
  **contraseña estándar** `USUARIO_PASSWORD` (valor actual `123123`). Es la
  que usará vuestra pantalla de usuario/tarjeta cuando la habilitéis: el
  usuario no la «crea», la conoce (o se la enseñáis).
- La **reanudación** (§1) sigue funcionando igual: al reenviar el alta con
  un email ya registrado, todas las cuentas nuevas usan la contraseña
  estándar → `201` reanudación. El `400 EMAIL_DUPLICADO` queda sólo para
  cuentas heredadas con otra contraseña (las creadas antes de este cambio).

### 4.2 `PATCH /api/comercio/password` — endpoint NUEVO (v1.6)

El comercio autenticado cambia **su propia** contraseña.

**Petición** (token de rol `comercio`):

| Campo | Tipo | Req. | Notas |
|---|---|---|---|
| `passwordActual` | string | ✅ | debe coincidir con la actual |
| `passwordNueva` | string | ✅ | mínimo 8 caracteres (`MIN_PASSWORD_ADMIN`) |

```json
{ "passwordActual": "Comercio123", "passwordNueva": "NuevaClave123" }
```

**`200`**

```json
{ "ok": true }
```

**Errores:**

| Código | HTTP | Cuándo |
|---|---|---|
| `VALIDATION` | 400 | faltan campos o `passwordNueva` < 8 |
| `PASSWORD_ACTUAL_INCORRECTA` | 401 | `passwordActual` no coincide |
| `UNAUTHORIZED` | 401 | sin token |
| `FORBIDDEN_ROLE` | 403 | token de `admin` (el admin restablece contraseñas con `PATCH /api/admin/comercios/:id`) |
| `COMERCIO_INACTIVO` | 403 | comercio desactivado |

**Notas:**

- Al cambiar la contraseña, **la anterior deja de valer** en todos los
  logins de ese comercio; los tokens ya emitidos siguen siendo válidos
  hasta que caduquen.
- Es el paso previo a una futura pantalla de «mi cuenta» del comercio; de
  momento puede integrarse en cualquier sitio con el token del comercio.

---

## 5. Cambios en las secciones del contrato principal

- **§3.4 · Login de tarjeta:** ejemplo con `googleWalletUrl` y
  `usuario.googleWalletObjetoId` + tabla de significado + nota de la
  **contraseña estándar** `USUARIO_PASSWORD`.
- **§3.5 · Registro:** body **sin `password`** (nota de que se ignora si
  llega), tabla de «reanudación» (201 / 400 / 403), nota de que no duplica
  filas ni toca saldos, la fila de error `EMAIL_DUPLICADO` reescrita
  («con contraseña distinta de la estándar») y la nota del **QR con sólo
  el id**.
- **§5.5 · Nuevo:** documentación de `PATCH /api/comercio/password`.
- **§8 · Códigos de error:** nuevo `PASSWORD_ACTUAL_INCORRECTA` (401);
  `EMAIL_DUPLICADO` → «con otra contraseña (misma contraseña ⇒
  reanudación `201`)».
- **§9 · Catálogo:** nuevo endpoint en la posición 12 → **20 endpoints**.
- **§12 · Checklist:** los puntos nuevos (reanudación, login/QR, registro
  sin contraseña y cambio de contraseña de comercio).
- **Versión del contrato:** `1.3` → **`1.6`**.

---

## 6. Notas de integración

1. **20 endpoints** (19 + `PATCH /api/comercio/password`). Los clientes
   actuales **no se rompen**: el registro tolera que sigáis mandando
   `password` en el body (se ignora).
2. **No cambia** el perfil, los listados, los endpoints de admin, el
   movimiento ni la clase de Google Wallet.
3. Cambios **sólo de servidor** (lógica): sin migraciones de BD y sin
   llamadas nuevas a Google (los enlaces se firman localmente).
4. Estado de guardado en el Wallet («¿la guardó ya?») sigue **sin**
   existir: queda para una fase futura (`GET .../google-wallet/estado`).
5. **Seguridad**: la contraseña estándar hace que el alta y el login de
   tarjeta sean «ocultos» (el usuario normal entra por la Wallet). Es una
   decisión deliberada del proyecto; si en el futuro se expone la pantalla
   de registro, convendrá volver a pedir contraseña.
