# Wallet Club API — CONTRATO TEMPORAL (solo cambios nuevos)

> **Fichero desechable.** Contiene ÚNICAMENTE la información que hay que
> integrar en `API_CONTRACT.md` (v1.0 → v1.1). El contrato definitivo ya la
> incluye; este fichero existe sólo para no tener que reenviar el documento
> completo al equipo de front.
>
> **Fecha:** 24/09/2026 · **Nuevo:** 1 endpoint (Google Wallet) + campos nuevos
> en los objetos `comercio`.

---

## 1. Endpoint nuevo

### `POST /api/admin/comercios/:idRandomLargo/google-wallet/clase`

Alta de la **CLASE** (plantilla) de fidelización de un comercio en **Google
Wallet**. Se crea **una sola clase por comercio**; todas las futuras tarjetas
de Google Wallet de ese comercio apuntarán a ella.

- **Rol:** **sólo `admin`** (token `Authorization: Bearer <JWT admin>`).
  Cualquier otro rol → `403 FORBIDDEN_ROLE`; sin token → `401`.
- **Qué NO hace:** no crea tarjetas/objetos individuales de Google Wallet
  (ese endpoint no existe todavía).

#### URL (path)

| Parámetro | Tipo | Req. | Notas |
|---|---|---|---|
| `:idRandomLargo` | string (48 hex) | ✅ | Debe ser un comercio **existente**. Es además el **sufijo de la clase**: `classId = <ISSUER_ID>.<idRandomLargo>` |

#### Body (JSON)

| Campo | Tipo | Req. | Notas |
|---|---|---|---|
| `imgLogo` | URL **HTTPS** pública | ✅ | Logo del programa |
| `imgHero` | URL **HTTPS** pública | ✗ | Banner grande de la tarjeta |
| `imgModulo` | URL **HTTPS** pública | ✗ | Foto del módulo de imagen |
| `hexBackgroundColor` | `#rgb` o `#rrggbb` | ✗ | **Si no se envía, el campo no se incluye y Google usa el color dominante de `imgHero`. Omitirlo NUNCA da error** (no hace falta ningún valor «anulador»; `""` sí daría error → enviar la cadena vacía cuenta como «no enviado») |
| `terminosTexto` | string, 1–1000 | ✅ | Cuerpo del bloque «Términos» visible en la tarjeta. El **título** de ese bloque es fijo: `Términos` |
| `reviewStatus` | `DRAFT` \| `UNDER_REVIEW` | ✗ (defecto `UNDER_REVIEW`) | `DRAFT` = en diseño (Google aún no admite crear tarjetas con ella); `UNDER_REVIEW` = lista para usar. Una vez fuera de `DRAFT` no se puede volver atrás |

**Campos derivados automáticamente** (no se envían, no hay que pedirlos al usuario):

- `issuerName` = `nombre` del comercio (p. ej. `Bar Reinol`)
- `programName` = `"Fidelización " + nombre` (p. ej. `Fidelización Bar Reinol`)

`clase.reviewStatus` de la respuesta es el estado **real** que devuelve Google
(puede ser `approved` aunque se enviara `UNDER_REVIEW`).

**Resto de la tarjeta** (etiquetas `Usuario`/`Cliente`, país `ES`, ids de
módulos…) son fijos del servidor: no se envían ni se pueden variar por API.

#### Respuestas

**`201` — clase creada**

```json
{
  "ok": true,
  "clase": {
    "id": "3388000000023208299.5949aef4b6e7e66be2a4c04e0a723c92d618d6e3bcac6b43",
    "reviewStatus": "UNDER_REVIEW",
    "issuerName": "Café Central",
    "programName": "Fidelización Café Central"
  },
  "comercio": {
    "id": 2,
    "nombre": "Café Central",
    "puntosPremio": 10,
    "premioDescripcion": "Café gratis",
    "activo": 1,
    "idRandomLargo": "5949aef4b6e7e66be2a4c04e0a723c92d618d6e3bcac6b43",
    "createdAt": "2026-09-24T09:00:00.000Z",
    "updatedAt": "2026-09-24T09:00:00.000Z",
    "googleWalletClaseId": "3388000000023208299.5949aef4b6e7e66be2a4c04e0a723c92d618d6e3bcac6b43",
    "googleWalletClaseEstado": "UNDER_REVIEW",
    "googleWalletClaseCreadaEn": "2026-09-24T09:00:00.000Z"
  }
}
```

**Errores nuevos**

| Código | HTTP | Cuándo / qué hace el front |
|---|---|---|
| `GOOGLE_CLASE_YA_EXISTE` | **409** | La clase **ya existía** en Google (usuario que reenvía el formulario, o clase creada previamente). **El front debe conocer este conflicto**: mostrar el aviso con el `message` (que incluye el id y, si se pudo leer, el estado) y **no** reintentar en bucle. La clase queda guardada en el comercio |
| `VALIDATION` | 400 | Falta `imgLogo` o `terminosTexto`, URL no `https://`, `hexBackgroundColor` mal formado o `reviewStatus` fuera del enum. El nombre del campo va dentro de `message` |
| `COMERCIO_NOT_FOUND` | **404** | El `idRandomLargo` de la URL no corresponde a ningún comercio |
| `GOOGLE_WALLET_400` | 400 | Google rechazó los datos construidos (p. ej. nombre del emisor demasiado largo). El `message` incluye el detalle de Google |
| `GOOGLE_WALLET_PERMISOS` | 502 | La service account no tiene el rol GCP «Wallet Object Issuer» → **problema del servidor**, avisar al equipo backend |
| `GOOGLE_WALLET_AUTH` | 502 | Google rechazó la autenticación → servidor |
| `GOOGLE_WALLET_INDISPONIBLE` | 502 | Google no responde / error no previsto → **reintentable** |
| `GOOGLE_WALLET_SIN_CONFIG` | 503 | Falta configuración en `.env` → servidor |
| `UNAUTHORIZED` / `INVALID_TOKEN` | 401 | token ausente/caducado → login |
| `FORBIDDEN_ROLE` | 403 | rol distinto de `admin` |

> Sólo se pintan como error de usuario: `VALIDATION`, `COMERCIO_NOT_FOUND`,
> `GOOGLE_CLASE_YA_EXISTE` y `GOOGLE_WALLET_400`. Los `5xx` son del servidor.

---

## 2. Campos nuevos en los objetos `comercio`

Aparecen ya disponibles en:

- `GET /api/comercio/perfil` (§5.1)
- `GET /api/admin/comercios` (§7.1)
- `GET /api/admin/comercios/:id` (§7.2)
- `POST /api/admin/comercios` (§7.3) y `PATCH /api/admin/comercios/:id` (§7.4)
- dentro de la respuesta `comercio` del nuevo endpoint (§1)

| Campo | Tipo | Significado |
|---|---|---|
| `googleWalletClaseId` | string o `null` | Id completo de la clase creada (`<ISSUER_ID>.<idRandomLargo>`). `null` = **aún no se ha creado** |
| `googleWalletClaseEstado` | string o `null` | Estado **real** devuelto por Google en la última alta (p. ej. `DRAFT`, `UNDER_REVIEW`, `approved`…). `null` = sin clase o estado desconocido |
| `googleWalletClaseCreadaEn` | string ISO 8601 o `null` | Momento en que se registró la clase en nuestra BD (sólo en `GET /api/admin/comercios/:id`) |

Los campos nuevos **no cambian** ninguno existente: los clientes que ya los
usen no se ven afectados.

---

## 3. Cambios en índices/enseñanzas globales del contrato

- **§1 Códigos HTTP:** se añaden `502` (Google Wallet no responde / rechaza) y
  `503` (Google Wallet sin configurar).
- **§8 Índice de `error.code`:** añadir las 6 filas nuevas de la tabla de
  arriba (`GOOGLE_CLASE_YA_EXISTE`, `GOOGLE_WALLET_400`, `GOOGLE_WALLET_PERMISOS`,
  `GOOGLE_WALLET_AUTH`, `GOOGLE_WALLET_INDISPONIBLE`, `GOOGLE_WALLET_SIN_CONFIG`).
- **§9 Catálogo:** añadir la fila **19**:

  | 19 | POST | `/api/admin/comercios/:idRandomLargo/google-wallet/clase` | admin |

- **§10 «Lo que NO existe»:** añadir: ❌ creación de **instancias/tarjetas**
  individuales en Google Wallet, ❌ `PATCH`/`DELETE` de una clase, ❌ endpoint de
  lectura de clases. **Sólo existe el alta de clase.**
- **§11 curl:**

  ```bash
  curl -s -X POST $BASE/api/admin/comercios/$ID_RANDOM/google-wallet/clase \
    -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" \
    -d '{"imgLogo":"https://ejemplo.com/logo.png",
         "imgHero":"https://ejemplo.com/hero.png",
         "imgModulo":"https://ejemplo.com/foto.png",
         "hexBackgroundColor":"#0B57D0",
         "terminosTexto":"1 punto por cada 1 € comprado.",
         "reviewStatus":"UNDER_REVIEW"}'
  ```

- **§12 Checklist:** añadir: el alta de clase devuelve `201` con `clase.id`;
  repetir el formulario devuelve `409 GOOGLE_CLASE_YA_EXISTE` y hay que
  informarlo (no reintentar en bucle).
- **Versión del contrato:** `1.0` → **`1.1`**.

---

## 4. Notas de integración para el formulario (web)

1. El formulario es de **admin**: requiere login de admin como el resto de
   `/api/admin/*`.
2. El `idRandomLargo` se puede obtener de un selector de comercios
   (`GET /api/admin/comercios`) — campo `idRandomLargo` de cada fila.
3. Las tres imágenes deben ser URLs **HTTPS públicas** (Google las descarga):
   sólo se aceptan `https://…`.
4. `hexBackgroundColor` es **realmente opcional**: si el usuario lo deja en
   blanco, no se envía el campo y Google colorea la tarjeta según el `imgHero`.
5. Si el usuario no sabe qué `reviewStatus` poner → defecto `UNDER_REVIEW`.
6. **Reenvíos:** si la misma clase se vuelve a enviar → `409
   GOOGLE_CLASE_YA_EXISTE`. Mostrar «la clase ya existe» (el `message` trae el
   id) y ofrecer cerrar o editar el comercio; el id también queda en
   `GET /api/admin/comercios/:id` → `googleWalletClaseId`.
7. Tras el `201`, el objeto `comercio` de la respuesta ya trae
   `googleWalletClaseId`/`googleWalletClaseEstado` actualizados: sirve para
   pintar el estado del formulario.
