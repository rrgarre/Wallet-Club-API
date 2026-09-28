// =====================================================================
//  Rutas del COMERCIO (token rol 'comercio'; admin permitido)
//  Todas exigen comercio ACTIVO.
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
  requireRole('comercio', 'admin'),
  resolverComercio,
  exigirComercioActivo
);

router.get('/comercio/perfil', ctrl.perfil);
router.get('/comercio/tarjetas', ctrl.listarTarjetas);
router.get('/comercio/tarjetas/:id', ctrl.obtenerTarjeta);
router.post('/comercio/tarjetas/:id/movimiento', ctrl.movimiento);
// Sólo el propio comercio: el admin restablece contraseñas con
// PATCH /api/admin/comercios/:id (por eso se estrecha el rol aquí).
router.patch('/comercio/password', requireRole('comercio'), ctrl.cambiarPassword);

module.exports = router;
