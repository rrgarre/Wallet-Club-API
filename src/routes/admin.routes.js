// =====================================================================
//  Rutas del ADMIN (token rol 'admin')
// =====================================================================
const express = require('express');
const { requireAuth, requireRole } = require('../middlewares/auth');
const ctrl = require('../controllers/adminController');
const ctrlGoogle = require('../controllers/googleWalletController');

const router = express.Router();

// Middleware sólo sobre las rutas de ESTE módulo (prefijo /admin)
router.use('/admin', requireAuth, requireRole('admin'));

router.get('/admin/comercios', ctrl.listarComercios);
router.get('/admin/comercios/:id', ctrl.obtenerComercio);
router.post('/admin/comercios', ctrl.crearComercio);
router.patch('/admin/comercios/:id', ctrl.editarComercio);

// Google Wallet: alta de la CLASE (plantilla) del comercio.
// Se identifica al comercio por su idRandomLargo (que es además el
// sufijo de la clase); NO da acceso por sí mismo a nada.
router.post(
  '/admin/comercios/:idRandomLargo/google-wallet/clase',
  ctrlGoogle.crearClase
);

router.get('/admin/tarjetas', ctrl.listarTarjetas);
router.get('/admin/tarjetas/:id', ctrl.obtenerTarjeta);

router.get('/admin/operaciones', ctrl.listarOperaciones);

module.exports = router;
