# ⚠️ Cambios temporales pendientes de integrar (v1.8)

> Se vacía en cada actualización: sólo queda el último cambio. Si esta
> página está vacía, la API está al día con `API_CONTRACT.md`.

## Login de comercio por `nombreUsuario` + nuevo rol `operario`

**Alcance amplio:** afecta a **login, matriz de permisos, panel de comercio y
alta/edición de comercios** (§2, §3.3, §5, §7.1–§7.4). **Sin endpoint nuevo:
siguen habiendo 20.** Detalle completo en `API_CONTRACT.md` v1.8; esto es
SÓLO lo que hay que cambiar ahora.

### 1. Login `POST /api/auth/comercio/login` (ROMPE lo anterior)

- Body ahora: **`{ nombreUsuario, password }`**. Se eliminan `idRandomLargo`
  y `nombre`: si llegan sin `nombreUsuario` → `400 VALIDATION`.
  (El `idRandomLargo` sigue vivo para la URL de registro, el QR y la clase.)
- **La contraseña decide el rol**, comprobándose **primero la de operario**:
  - contraseña de operario → **`role: "operario"`**
  - si no cuadra, la de comercio → **`role: "comercio"`**
- El front debe **ramificar la navegación con `role`** (antes era siempre
  `comercio`).
- `nombreUsuario`: 3–32, `[a-z0-9_]`, case-insensitive. `401` si no existe
  (no filtra), `403 COMERCIO_INACTIVO` si el comercio está desactivado.

### 2. Rol nuevo: `operario` (camarero)

Sólo puede **2 cosas** (su comercio, con las mismas reglas de movimiento que
el comercio):

- `GET /api/comercio/tarjetas/:id` → leer la **tarjeta escaneada**
- `POST /api/comercio/tarjetas/:id/movimiento` → modificar sus contadores

Todo lo demás → **`403 FORBIDDEN_ROLE`**: listado de tarjetas, perfil del
comercio, `PATCH /api/comercio/password`, rutas de admin y de tarjeta.

### 3. Alta de comercio `POST /api/admin/comercios` (ROMPE lo anterior)

Body nuevo, **ambos obligatorios**:

- **`nombreUsuario`** (único global → `400 USUARIO_DUPLICADO` si repite;
  formato inválido → `400 VALIDATION`)
- **`operarioPassword`** (mínimo 8 → `400 VALIDATION` si corta)

La respuesta expone `nombreUsuario` y **nunca** `passwordHash` ni
`operarioHash`.

### 4. `PATCH /api/admin/comercios/:id`

Acepta además **`nombreUsuario`** y **`operarioPassword`** (mismas reglas).
Es el camino para **rellenar los comercios heredados**: los existentes
quedaron con `nombreUsuario: null` y **NO pueden iniciar sesión** hasta que
les asignes usuario + contraseña de operario desde admin.

### 5. Campos nuevos visibles

- `nombreUsuario` en: login (respuesta), `GET /api/comercio/perfil`,
  `GET /api/admin/comercios` y `GET /api/admin/comercios/:id`.
- `operarioHash` **no aparece nunca** en ninguna respuesta.
