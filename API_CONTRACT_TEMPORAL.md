# Wallet Club API — CONTRATO TEMPORAL: login de comercio SÓLO por idRandomLargo (v1.6)

> **Fichero desechable.** Contiene ÚNICAMENTE la información que hay que
> integrar en `API_CONTRACT.md` para **este cambio**. Cuando haya otro
> cambio de contrato, este fichero se vacía y sólo queda lo nuevo.
> El contrato definitivo (v1.6) ya lo incluye.
>
> **Fecha:** 28/09/2026

---

## 1. `POST /api/auth/comercio/login` — se eliminó el login por `nombre`

**Cambia la petición.** Antes se aceptaba `idRandomLargo` **o** `nombre`
(uno de los dos) + `password`. Ahora **sólo `idRandomLargo` + `password`**:

### Antes

```json
{ "nombre": "Café Central", "password": "..." }      // valía
{ "idRandomLargo": "5949aef4...", "password": "..." } // valía
```

### Ahora

```json
{ "idRandomLargo": "5949aef4b6e7e66be2a4c04e0a723c92d618d6e3bcac6b43", "password": "..." }
```

| Situación | Respuesta |
|---|---|
| `idRandomLargo` + `password` correctos | `200` con `token`/`role` (igual que siempre) |
| Sólo `nombre` (o sin `idRandomLargo`) | `400 VALIDATION` — campo `idRandomLargo` obligatorio |
| id correcto + password mala | `401 BAD_CREDENTIALS` (igual que siempre) |
| Cuenta desactivada | `403 COMERCIO_INACTIVO` (igual que siempre) |

**La respuesta `200` no cambia** (mismos campos: `token`, `role`,
`usuario`). Sólo cambia qué se manda en la petición.

---

## 2. Qué tiene que cambiar el front

- En la pantalla de login de comercio, si se puede entrar con el **nombre**
  del comercio, hay que **quitarse esa opción**: el identificador que se
  manda es siempre el **`idRandomLargo`** (la clave de 48 caracteres que la
  API devuelve en el alta/`GET` de comercios y que el comercio tiene como
  su «usuario»).
- Si el formulario no lo tiene ya, habrá que pedirlo/pasarlo: sin él el
  login devuelve `400`.

---

## 3. Ámbito afectado

- Cambio **sólo** del endpoint de login de comercio: no afecta a los logins
  de admin (siguen por `nombre`) ni al de tarjeta (sigue por `email`), ni
  a ningún endpoint más. Sin migraciones de BD.
