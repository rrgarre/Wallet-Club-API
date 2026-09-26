# Wallet Club API — CONTRATO TEMPORAL v1.4 (solo cambios nuevos)

> **Fichero desechable.** Contiene ÚNICAMENTE la información que hay que
> integrar en `API_CONTRACT.md` (v1.3 → **v1.4**): la **reanudación del
> registro de tarjeta** y el **`googleWalletUrl` en el login**. Ambos cambios
> resuelven el callejón sin salida de «me registré, no ejecuté el enlace de
> Google Wallet y ahora me dice que el email ya está registrado».
> El contrato definitivo ya la incluye; este fichero existe sólo para no
> tener que reenviar el documento completo al equipo de front.
>
> *(Los temporales anteriores —clase v1.1, registro v1.2, movimiento v1.3—
> ya fueron integrados.)*
> **Fecha:** 26/09/2026

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

## 3. Cambios en las secciones del contrato principal

- **§3.4 · Login de tarjeta:** ejemplo con `googleWalletUrl` y
  `usuario.googleWalletObjetoId` + tabla de significado.
- **§3.5 · Registro:** tabla de «reanudación» (201 / 400 / 403), nota de que
  no duplica filas ni toca saldos, y la fila de error `EMAIL_DUPLICADO`
  reescrita («con otra contraseña»).
- **§8 · Códigos de error:** `EMAIL_DUPLICADO` → «con otra contraseña
  (misma contraseña ⇒ reanudación `201`)».
- **§12 · Checklist:** los dos puntos nuevos (reanudación y login).
- **Versión del contrato:** `1.3` → **`1.4`**.

---

## 4. Notas de integración

1. **No hay endpoints nuevos**: siguen habiendo 19; sólo cambian dos
   respuestas que ya existían. Los clientes actuales **no se rompen**
   (sólo ganan campos y un caso de éxito donde antes había error).
2. **No cambia** el perfil, los listados, los endpoints de admin, el
   movimiento ni la clase de Google Wallet.
3. Cambios **sólo de servidor** (lógica): sin migraciones de BD y sin
   llamadas nuevas a Google (los enlaces se firman localmente).
4. Estado de guardado en el Wallet («¿la guardó ya?») sigue **sin**
   existir: queda para una fase futura (`GET .../google-wallet/estado`).
