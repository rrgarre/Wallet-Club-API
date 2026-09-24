# Wallet Club API — CONTRATO TEMPORAL v1.3 (solo cambios nuevos)

> **Fichero desechable.** Contiene ÚNICAMENTE la información que hay que
> integrar en `API_CONTRACT.md` (v1.2 → **v1.3**): el campo `googleWallet` en
> la respuesta de **movimiento de puntos/premios** (sincronización con
> Google Wallet).
> El contrato definitivo ya la incluye; este fichero existe sólo para no
> tener que reenviar el documento completo al equipo de front.
>
> *(Los temporales anteriores —clase v1.1 y registro/enlace v1.2— ya fueron
> integrados.)*
> **Fecha:** 24/09/2026

---

## 1. `POST /api/comercio/tarjetas/:id/movimiento` — campo nuevo `googleWallet`

**No cambia la petición** (mismo body: `puntosDelta`, `premiosDelta`,
`tipo`, `nombre`, `codigoCamarero`, `idempotencia`, …) ni ningún otro campo
de la respuesta. **Se añade un campo nuevo** tanto al `201` (movimiento
aplicado) como al `200` (`duplicado: true`):

```json
{
  "ok": true,
  "duplicado": false,
  "idOperacion": 5,
  "idConversion": null,
  "conversion": null,
  "requiereNombre": false,
  "googleWallet": "sincronizado",
  "tarjeta": { "id": 2, "...": "saldo ya actualizado" }
}
```

### Qué significa cada valor

| Valor | Cuándo ocurre | Qué hacer en la interfaz |
|---|---|---|
| `"sincronizado"` | Google confirmó el `PATCH` de los saldos (puntos y premios del objeto) | Nada |
| `"sin_objeto"` | La tarjeta tiene enlace, pero el usuario **aún no la ha guardado** en su Google Wallet (Google responde 404) | Nada: es el estado normal hasta que el usuario pulse «Guardar en Google Wallet» |
| `"error"` | Google no contestó o falló (timeout 10 s, 5xx…). **El movimiento en nuestra BD SÍ se aplicó** | Aviso discreto, p. ej. «Guardado. Reintentaremos la sincronización con Google Wallet». **No** reintentar el movimiento: se pone solo al día con el próximo movimiento o con un reintento idempotente |
| `null` | La tarjeta **no tiene enlace** de Google Wallet (su comercio no tiene clase aprobada) | No mostrar nada |

### Advertencias importantes

- ⚠ **La BD local es la fuente de verdad.** Este campo es sólo informativo:
  **nunca** hay que bloquear, rechazar ni repetir el movimiento en función
  de su valor (ni en el `201` ni en el `200`).
- La sincronización se lanza **después** del `COMMIT`, con timeout de 10 s:
  el tiempo de respuesta del movimiento puede aumentar unos milisegundos.
- En el caso `duplicado: true` (reintento con la misma `idempotencia`) el
  campo también aparece: se reenvía el mismo saldo como oportunidad de
  «auto-sanación» si la sincronización anterior falló. El saldo **no** cambia.
- Los valores de `tarjeta.puntos` y `tarjeta.premios` de la respuesta son
  exactamente los que se envían a Google.

---

## 2. Cambios en las secciones del contrato principal

- **§5.4 · Movimiento:** ejemplo `201` con `"googleWallet": "sincronizado"` y
  la tabla de valores con la sugerencia de interfaz.
- **§12 · Checklist:** añadir → «El movimiento devuelve `googleWallet`:
  `sincronizado`/`sin_objeto` no requieren nada; `error` avisa sin reintentar
  el movimiento; `null` = sin enlace, no mostrar nada.»
- **Versión del contrato:** `1.2` → **`1.3`**.

---

## 3. Notas de integración

1. **No hay endpoint nuevo**: sigue habiendo 19 endpoints; sólo cambia una
   respuesta que ya existía.
2. Tampoco cambia la petición: los clientes actuales **no se rompen** (sólo
   ignoran un campo que antes no venían).
3. Sólo cambia `POST .../movimiento`. **No** cambian el registro, el perfil,
   los listados de tarjetas, los endpoints de admin ni el alta de clase.
4. El QR que escanea el camarero (`barcode` del objeto) sigue siendo
   `<FRONT_URL>/comercio/captura/<idTarjeta>` y los saldos del objeto en
   Google se actualizan con cada movimiento (era la «fase futura» del
   v1.2, ya implementada).
5. Google **no permite borrar** clases ni objetos desde su API: no existirá
   endpoint de borrado (si una tarjeta se diera de baja, su objeto quedaría
   inerte con `state: expired` — de momento no hay baja de tarjetas).
