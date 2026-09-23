// =====================================================================
//  Rutas de la TARJETA / CLIENTE (token rol 'tarjeta'; admin permitido)
// =====================================================================
const express = require('express');
const { requireAuth, requireRole } = require('../middlewares/auth');
const ctrl = require('../controllers/tarjetaController');

const router = express.Router();

// Middleware sólo sobre las rutas de ESTE módulo (prefijo /tarjeta)
router.use('/tarjeta', requireAuth, requireRole('tarjeta', 'admin'));

router.get('/tarjeta/perfil', ctrl.perfil);
router.get('/tarjeta/operaciones', ctrl.historial);

module.exports = router;
