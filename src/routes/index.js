// =====================================================================
//  Montaje de todas las rutas bajo /api
// =====================================================================
const express = require('express');

const publicRoutes = require('./public.routes');
const tarjetaRoutes = require('./tarjeta.routes');
const comercioRoutes = require('./comercio.routes');
const adminRoutes = require('./admin.routes');

const router = express.Router();

router.use(publicRoutes);   // POST /auth/*/login, POST /registro/tarjeta/:idRandomLargo
router.use(tarjetaRoutes);  // GET  /tarjeta/*
router.use(comercioRoutes); // GET/POST /comercio/*
router.use(adminRoutes);    // GET/POST/PATCH /admin/*

module.exports = router;
