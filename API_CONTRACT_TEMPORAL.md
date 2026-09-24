# Wallet Club API — CONTRATO TEMPORAL v1.2 (solo cambios nuevos)

> **Fichero desechable.** Contiene ÚNICAMENTE la información que hay que
> integrar en `API_CONTRACT.md` (v1.1 → **v1.2**): el enlace de Google Wallet
> en el **registro de tarjeta** y el nuevo campo en los objetos `tarjeta`.
> El contrato definitivo ya la incluye; este fichero existe sólo para no
> tener que reenviar el documento completo al equipo de front.
>
> *(El temporal anterior —clase de Google Wallet, v1.1— ya fue integrado.)*
> **Fecha:** 24/09/2026

---

## 1. `POST /api/registro/tarjeta/:idRandomLargo` — respuesta `201` ampliada

No cambia la petición (**mismo body que siempre**: `nombre`, `email`,
`password`), ni el `token`. Sólo **se añaden dos campos a la respuesta**:

```json
{
  "ok": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "role": "tarjeta",
  "usuario": {
    "id": 8,
    "nombre": "Prueba Wallet",
    "email": "prueba.wallet@temp.com",
    "comercioId": 5,
    "puntos": 0,
    "premios": 0,
    "googleWalletObjetoId": "3388000000023208299.USER_8_COMERCIO_322bcbe4eb2e4f2322a16ed1f1cf259f7e8357940aaa62f5"
  },
  "comercio": { "id": 5, "nombre": "Chiringuito" },
  "googleWalletUrl": "https://pay.google.com/gp/v/save/eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### `googleWalletUrl` (nuevo)

| Valor | Cuándo | Qué hace el front |
|---|---|---|
| `string` (URL de Google) | El comercio **ya tiene clase creada** en Google Wallet y la clase no está en `DRAFT` | Mostrar el botón/enlace **«Guardar en Google Wallet»** en la pantalla de alta (abre `pay.google.com` y el usuario guarda la tarjeta) |
| `null` | Comercio **sin clase creada**, clase en `DRAFT`, o falta configuración en el servidor | **El alta se completa igualmente** (no es un error). Se puede mostrar «este comercio aún no tiene tarjeta en Google Wallet» o directamente no mostrar nada |

**Advertencias importantes para la interfaz:**

- ⚠ La URL **no está vinculada a ninguna cuenta**: quien la abra se la guarda en
  **su** Google Wallet. Devuélvela **sólo** al cliente que hizo el alta: no la
  expongas en listados, no la registres en analíticas, no la imprimas en QR.
- **No se puede recuperar después**: no existe endpoint que la vuelva a dar
  (no está en `GET /api/tarjeta/perfil`). Si el usuario la pierde, hay que
  darle de alta de nuevo o esperar a la fase de sincronización.
- La URL es **siempre válida** mientras exista la clase; no caduca.

### `usuario.googleWalletObjetoId` (nuevo campo)

| Tipo | Significado |
|---|---|
| `string` o `null` | Id del objeto (tarjeta) en Google Wallet. `null` si no se generó enlace |

---

## 2. Campo nuevo en los objetos `tarjeta`

Aparece en **todas** las respuestas que devuelven tarjetas:

- `GET /api/tarjeta/perfil` (§4.1)
- `GET /api/comercio/tarjetas` y `GET /api/comercio/tarjetas/:id` (§5.2, §5.3)
- `GET /api/admin/tarjetas` y `GET /api/admin/tarjetas/:id` (§7.5, §7.6)
- `tarjeta` de la respuesta de `POST .../movimiento` (§5.4)
- `usuario` de login y registro de tarjeta (§3.4, §3.5)

| Campo | Tipo | Significado |
|---|---|---|
| `googleWalletObjetoId` | string o `null` | Id del objeto en Google Wallet (`<issuerId>.USER_<idTarjeta>_COMERCIO_<idRandomLargo>`). `null` = esa tarjeta no tiene (todavía) objeto en Google Wallet |

Es de **sólo lectura** para el cliente: no se puede enviar en ninguna petición.

---

## 3. Cambios en las secciones del contrato principal

- **§1 · Tipos de datos:** añadir fila →
  `googleWalletObjetoId`, `googleWalletClaseId` | string o `null` (ids de Google Wallet).
- **§3.5 · Registro:** respuesta `201` con los dos campos nuevos y la tabla de
  comportamiento de `googleWalletUrl` (puntos 1 arriba), incluida la advertencia
  de que la URL sólo se devuelve ahí.
- **§4.1, §5.2, §5.3, §7.5, §7.6:** los objetos `tarjeta` incluyen
  `googleWalletObjetoId`.
- **§12 · Checklist:** añadir → «El registro devuelve `googleWalletUrl`: si es
  `string`, ofrecer «Guardar en Google Wallet»; si es `null`, completar el alta
  sin más.»
- **Versión del contrato:** `1.1` → **`1.2`**.

---

## 4. Notas de integración

1. **No hay endpoint nuevo**: sigue habiendo 19 endpoints; sólo cambia una
   respuesta que ya existía.
2. El QR que escanea el camarero (`barcode` del objeto) es
   `<FRONT_URL>/comercio/captura/<idTarjeta>` — generado por el servidor, el
   front no lo calcula ni lo envía.
3. Puntos y premios del objeto se crean en `0` (como la tarjeta en nuestra BD);
   la sincronización de saldos con Google Wallet es una **fase futura** (PATCH).
4. Si el alta se hace desde un comercio **sin clase**, el mismo formulario de
   registro sirve: `googleWalletUrl` será `null` y nada más cambia.
