// =====================================================================
//  Rutas del COMERCIO (token rol 'comercio' u 'operario'; admin permitido)
//  Todas exigen comercio ACTIVO.
//
//  Operario/camarero (rol 'operario', v1.8): SÓLO puede ver la tarjeta
//  escaneada (GET /comercio/tarjetas/:id) y mover sus contadores
//  (POST .../movimiento). NO ve el listado, ni el perfil, ni cambia
//  contraseñas, ni nada más.
// =====================================================================
const express = require('express');
const { requireAuth, requireRole } = require('../middlewares/auth');
const { resolverComercio, exigirComercioActivo } = require('../middlewares/comercioContext');
const ctrl = require('../controllers/comercioController');

const router = express.Router();

// Middleware sólo sobre las rutas de ESTE módulo (prefijo /comercio)
router.use(
  '/comercio',
  requireAuth,
  requireRole('comercio', 'operario', 'admin'),
  resolverComercio,
  exigirComercioActivo
);

// Sólo comercio/admin: el operario NO consulta estas opciones.
router.get('/comercio/perfil', requireRole('comercio', 'admin'), ctrl.perfil);
router.get('/comercio/tarjetas', requireRole('comercio', 'admin'), ctrl.listarTarjetas);
// La tarjeta ESCANEADA: comercio, operario o admin.
router.get('/comercio/tarjetas/:id', ctrl.obtenerTarjeta);
router.post('/comercio/tarjetas/:id/movimiento', ctrl.movimiento);
// Sólo el propio comercio: el admin restablece contraseñas con
// PATCH /api/admin/comercios/:id (por eso se estrecha el rol aquí).
router.patch('/comercio/password', requireRole('comercio'), ctrl.cambiarPassword);
// v1.9: cambiar la contraseña de OPERARIO. La pide/cambia el comercio
// (con su propia contraseña como garantía) o el admin (con comercioId);
// el propio operario NO (403: no se autorrestringe su acceso).
router.patch(
  '/comercio/operario-password',
  requireRole('comercio', 'admin'),
  ctrl.cambiarPasswordOperario
);

module.exports = router;
