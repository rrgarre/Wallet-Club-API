// =====================================================================
//  Rutas PÚBLICAS (sin token)
// =====================================================================
const express = require('express');
const ctrl = require('../controllers/authController');

const router = express.Router();

// Logins (el idRandomLargo NO sirve de credencial: siempre se pide password)
router.post('/auth/admin/login', ctrl.loginAdmin);
router.post('/auth/comercio/login', ctrl.loginComercio);
router.post('/auth/tarjeta/login', ctrl.loginTarjeta);

// Registro de cliente: el idRandomLargo del comercio va en la URL y la
// comercioId la deduce el controller.
router.post('/registro/tarjeta/:idRandomLargo', ctrl.registroTarjeta);

module.exports = router;
