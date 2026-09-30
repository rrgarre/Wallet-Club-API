# ⚠️ Cambios temporales pendientes de integrar (v1.7)

> Se vacía en cada actualización: sólo queda el último cambio. Si esta
> página está vacía, la API está al día con `API_CONTRACT.md`.

## Tarjetas con `sistema`: `google` | `apple` (fase 1 informativa)

**Alcance amplio (no sólo el registro):** afecta a **5 puntos** de la
interfaz — registro (§3.5), login de tarjeta (§3.4), perfil (§4.1),
listados de tarjetas (§5.2 / §7.5) y el campo `googleWallet` del
movimiento (§5.4). **Sin endpoint nuevo: siguen habiendo 20.** El detalle
completo está en `API_CONTRACT.md` v1.7; esto es SÓLO lo que el front
debe cambiar ahora.

### 1. Registro `POST /api/registro/tarjeta/:idRandomLargo`

- Body nuevo campo **`sistema`**: `"google"` | `"apple"`. **Opcional**:
  si no llega ⇒ `google` (fronts antiguos siguen funcionando). Otro valor
  ⇒ `400 VALIDATION`.
- Respuesta `201` (sigue **sin `token` ni `role`**) añade
  **`usuario.sistema`**.
- **Con `sistema: "apple"`**: `googleWalletUrl: null` **siempre** y aparece
  **`"mensaje": "sistema_apple"`**. No hay lógica de Apple todavía: el
  front sólo debe reconocer ese literal (no redirigir ni llamar a Apple).
- **Duplicados por sistema**: el mismo email con `sistema` distinto NO
  choca — es una **tarjeta nueva e independiente** (fila e id propios).
  Repetir el registro con el mismo `sistema` = reanudación `201` como
  hasta ahora (apple incluido: `mensaje: "sistema_apple"`, misma fila).

### 2. Login de tarjeta `POST /api/auth/tarjeta/login` (pantalla en desuso)

- `usuario.sistema` añadido; si la tarjeta es `apple`,
  `googleWalletUrl` es `null`.
- ⚠ **Efecto conocido**: si un email tiene las **dos** tarjetas (google +
  apple) y se llama **sin `comercioId`** ⇒ `409 EMAIL_AMBIGUO` (repetir
  con `comercioId`). No es una regresión: es el login antiguo desambiguando.

### 3. Movimiento `POST /api/comercio/tarjetas/:id/movimiento`

- El campo `googleWallet` puede devolver **`"sistema_apple"`** (tarjeta
  apple: **no se llama a Google**). El movimiento **está aplicado** igual:
  no bloquear, no reintentar, no mostrar nada de Google.

### 4. Listados / perfil

- `sistema` aparece en `GET /api/tarjeta/perfil`, `GET /api/comercio/tarjetas`
  (y `/:id`) y `GET /api/admin/tarjetas` (y `/:id`).

### 5. Lo que NO cambia

- El alta **sigue sin `token`/`role`**; la contraseña sigue siendo la fija
  `USUARIO_PASSWORD`; el login de comercio sigue siendo sólo
  `idRandomLargo` + `password`.
- **No existe** endpoint para cambiar el `sistema` de una tarjeta ya dada
  de alta (candidato eliminado del diseño).
