# ⚠️ Cambios temporales pendientes de integrar (v1.10)

> Se vacía en cada actualización: sólo queda el último cambio. Si esta
> página está vacía, la API está al día con `API_CONTRACT.md`.

## `maximoPremios`: techo de premios por comercio

**Alcance:** campo nuevo en `comercios` + regla de recorte en el
movimiento + alta/edición de admin (§5.1, §5.4, §6.7, §7.1–§7.4).
**Sin endpoint nuevo: siguen 21.** Detalle completo en
`API_CONTRACT.md` v1.10; esto es SÓLO lo que hay que cambiar ahora.

### 1. Campo nuevo: `comercios.maximoPremios`

- Entero **≥ 0**. **`0` = SIN LÍMITE** (comportamiento actual intacto:
  los 3 comercios existentes quedaron a 0 con la migración; nadie nota
  nada hasta que el admin ponga un techo).
- Se puede **crear** con él (`POST /api/admin/comercios`, opcional,
  defecto 0) y **editar** (`PATCH /api/admin/comercios/:id`); negativo o
  no entero → `400 VALIDATION`.
- **Visible** en: `GET /api/comercio/perfil`, `GET /api/admin/comercios`
  y `GET /api/admin/comercios/:id`.

### 1b. `maximoPremios` también para el AVISO del front (§5.3 y §5.4)

Para que la pantalla de mover puntos pueda avisar «esto llegará al
techo» (también desde el camarero / operario):

- **`GET /api/comercio/tarjetas/:id`** → ahora responde
  `{ ok, maximoPremios, tarjeta }` (el techo va **fuera** de `tarjeta`:
  es del comercio). El operario **sí** puede leer este endpoint.
- **`POST .../movimiento`** → la respuesta (`201` **y** `200`
  duplicado) incluye `maximoPremios` a nivel superior, junto a
  `googleWallet`. Con `tarjeta.premios` + `maximoPremios` el front sabe
  tras cada movimiento si habrá recorte en el siguiente.

### 2. Regla de recorte en `POST /api/comercio/tarjetas/:id/movimiento`

Si el comercio tiene `maximoPremios > 0` y el **resultado final** de
premios del movimiento (delta manual **y/o** canje automático por
acumulación de puntos) lo supera → **premios se igualan al máximo,
silenciosamente**, en esa misma operación:

- Sigue respondiendo **`201`**; `tarjeta.premios` de la respuesta ya
  viene **recortado** (es autoritativo). **No hay indicador** del
  recorte: el front avisará él (p. ej. avisando antes de enviar que el
  movimiento llegará al techo).
- Aplica también si la operación **resta** premios y el saldo seguía
  por encima (p. ej. el admin bajó el techo): la **siguiente**
  operación que pase por la verificación los iguala al máximo.
- El libro de operaciones registra lo pedido (`premiosDelta`); el saldo
  guardado es lo recortado (un saldo por debajo de la suma de deltas
  puede deberse a un techo).

### 3. Sin cambios en el resto

Login, roles/permisos, registro de tarjetas, Google/Apple Wallet:
**sin cambios**. Endpoints: **sin nuevos** (sólo 2 respuestas existentes
añaden el campo: §5.3 y §5.4).
