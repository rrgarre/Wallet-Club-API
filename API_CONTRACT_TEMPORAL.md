# ⚠️ Cambios temporales pendientes de integrar (v1.11)

> Se vacía en cada actualización: sólo queda el último cambio. Si esta
> página está vacía, la API está al día con `API_CONTRACT.md`.

## Tope de puntos: contadores congelados en el techo

**Alcance:** sin endpoints nuevos ni campos nuevos en la BD — sólo cambia
el **comportamiento** del movimiento (§5.3, §5.4, §6.8). Detalle completo
en `API_CONTRACT.md` v1.11; esto es SÓLO lo que hay que cambiar ahora.

### 1. Nuevo estado en el front: «tope de puntos»

Una tarjeta está **en tope** cuando:

```
maximoPremios > 0  &&  premios == maximoPremios  &&  puntos == puntosPremio - 1
```

- **`puntosPremio` es visible ahora** en `GET /api/comercio/tarjetas/:id`
  (§5.3) y en la respuesta del movimiento (§5.4, `201` y `200` duplicado),
  junto a `maximoPremios`. Con esos dos campos el front se autocalcula el
  estado (rol operario incluido: antes no podía leer `puntosPremio`).
- Con esos datos puede **avisar** antes de enviar («esto llegará al
  techo») y evitar pulsar incrementos sobre el máximo.

### 2. Qué pasa en el servidor si llega un movimiento en tope

- **Subidas (puntos o premios): absorbidas en silencio.** Responde `201`
  con la operación registrada en el libro, pero **los saldos no se
  mueven** (`tarjeta.puntos` sigue en `puntosPremio - 1`, `tarjeta.premios`
  en el techo). Sin canje automático y **sin reset del contador de
  puntos** — era justo lo que sobraba.
- **Remontón**: si los premios ya están en el techo y los puntos
  alcanzarían `puntosPremio` (o más), se recortan a `puntosPremio - 1`
  **sin convertir** (el premio resultante lo confiscaría el techo).
- **Bajadas (canje de premios, correcciones a la baja): sí se aplican.**
  Al bajar `premios` por debajo del techo la tarjeta **descongela** y los
  puntos vuelven a convertirse con normalidad.
- **`maximoPremios = 0` (sin límite) nunca congela**: comportamiento
  histórico intacto.

### 3. Sin cambios en el resto

Login, roles/permisos, registro, Google/Apple Wallet, altas/edición de
comercios: **sin cambios**. Sigue habiendo **21 endpoints**.
