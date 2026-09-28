# Wallet Club API — CONTRATO TEMPORAL: alta de tarjeta SIN token (v1.6)

> **Fichero desechable.** Contiene ÚNICAMENTE la información que hay que
> integrar en `API_CONTRACT.md` para **este cambio**. Cuando haya otro
> cambio de contrato, este fichero se vacía y sólo queda lo nuevo.
> El contrato definitivo (v1.6) ya lo incluye.
>
> **Fecha:** 28/09/2026

---

## 1. `POST /api/registro/tarjeta/:idRandomLargo` — la respuesta ya NO lleva token

**No cambia la petición** (mismo body: `nombre`, `email`, sin `password`).
**Cambia la respuesta `201`**: se eliminan los campos `token` y `role`.

### Antes

```json
{
  "ok": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "role": "tarjeta",
  "usuario": { "...": "..." },
  "comercio": { "id": 5, "nombre": "Chiringuito" },
  "googleWalletUrl": "https://pay.google.com/gp/v/save/eyJhbGciOiJSUzI1NiIs..."
}
```

### Ahora

```json
{
  "ok": true,
  "usuario": { "...": "..." },
  "comercio": { "id": 5, "nombre": "Chiringuito" },
  "googleWalletUrl": "https://pay.google.com/gp/v/save/eyJhbGciOiJSUzI1NiIs..."
}
```

Se mantiene **todo lo demás**: `usuario`, `comercio` y `googleWalletUrl`
(el enlace «Guardar en Google Wallet» sigue saliendo aquí, que es para lo
que sirve el alta).

---

## 2. Qué tiene que cambiar el front

- **Quitar el auto-login tras el alta**: al recibir el `201` del registro
  ya **no hay token que guardar** → no persistir sesión en el navegador a
  partir de esa respuesta y **no redirigir automáticamente** a la pantalla
  de usuario/tarjeta.
- En su sitio, pantalla normal de confirmación (con el botón «Guardar en
  Google Wallet» si `googleWalletUrl` es `string`).
- Si el usuario quiere entrar a su pantalla, lo hace **a mano** con el
  login: `POST /api/auth/tarjeta/login` **sigue devolviendo `token` y
  `role` igual que siempre** (su contraseña también: no cambia nada).
- **La reanudación del alta** (mismo email, §3.5) tiene **la misma forma**
  que el alta → tampoco devuelve token.

---

## 3. Ámbito afectado

- El cambio es del endpoint de registro, pero **afecta al flujo completo
  post-alta** del front (auto-login, redirección y persistencia de sesión
  tras registrarse): es comportamiento que quizá esté en varios sitios de
  la interfaz, no sólo en el formulario de alta.
- **Ningún otro endpoint cambia**: logins, perfil, movimiento, comercio,
  admin y Google Wallet intactos. Sin migraciones de BD.
