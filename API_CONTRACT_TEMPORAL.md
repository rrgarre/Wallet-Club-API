# ⚠️ Cambios temporales pendientes de integrar (v1.9)

> Se vacía en cada actualización: sólo queda el último cambio. Si esta
> página está vacía, la API está al día con `API_CONTRACT.md`.

## Cambiar la contraseña de operario + regla «comercio ≠ operario»

**Alcance:** endpoints de cambio de contraseña y alta/edición de comercios
(§5.5, §5.6, §7.3, §7.4, §8). **1 endpoint nuevo → 21 en total.**
Detalle completo en `API_CONTRACT.md` v1.9; esto es SÓLO lo que hay que
cambiar ahora.

### 1. Endpoint nuevo: `PATCH /api/comercio/operario-password`

Roles: **`comercio`** y **`admin`** (el `operario` → `403 FORBIDDEN_ROLE`).

- **Rol comercio** — body:

```json
{
  "passwordActual": "…contraseña DEL comercio…",
  "operarioPasswordNueva": "…mínimo 8…",
  "operarioPasswordConfirmacion": "…igual que la anterior…"
}
```

  · `passwordActual` se verifica contra la contraseña **del comercio** (el
  comercio **nunca** teclea la antigua de operario: no la conoce) →
  `401 PASSWORD_ACTUAL_INCORRECTA`.
  · confirmación distinta → `400 VALIDATION`.

- **Rol admin** — body: `{ "operarioPasswordNueva": "…" }` + `comercioId`
  obligatorio (query o body → si falta, `400 COMERCIO_REQUERIDO`).

- **`200 { ok: true }`**. La contraseña de operio**r** antigua deja de valer
  en el login **al instante** (los JWT de operario emitidos caducan solos).
  El cliente debe ofrecer este cambio en el panel del comercio (nuevo
  formulario: contraseña del comercio + nueva de operario ×2).

### 2. Regla nueva: la contraseña de comercio y la de operario NO pueden ser iguales

Nuevo código de error **`400 PASSWORDS_IGUALES`** (mensaje: «La
contraseña de comercio y la de operario no pueden ser iguales»).

**Motivo:** el login prueba **primero** la de operario; si ambas fueran la
misma, el comercio sólo entraría como `operario` y perdería su panel.

Aplica en **todos** los caminos:

| Endpoint | Cuándo |
|---|---|
| `PATCH /api/comercio/password` (§5.5) | `passwordNueva` == contraseña de operario guardada |
| `PATCH /api/comercio/operario-password` (§5.6) | `operarioPasswordNueva` == contraseña de comercio guardada |
| `POST /api/admin/comercios` (§7.3) | `password` == `operarioPassword` en el alta |
| `PATCH /api/admin/comercios/:id` (§7.4) | la nueva `password` == operario guardado, o la nueva `operarioPassword` == comercio guardado (o las dos enviadas, entre sí) |

(Comercios heredados sin operario (`operarioHash` NULL): no hay conflicto
posible, se salta la comprobación.)

### 3. Sin cambios en el resto

Login, matriz de permisos, movimientos y tarjetas: **sin cambios** (el
rol `operario` sigue sin poder tocar contraseñas).
