// =====================================================================
//  Configuración de la aplicación Express (sin escuchar puertos)
// =====================================================================
const express = require('express');
const cors = require('cors');

const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middlewares/errors');

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Cabecera informativa
app.use((req, res, next) => {
  res.setHeader('X-Powered-By', 'Wallet-Club-API');
  next();
});

app.get('/health', async (req, res) => {
  const { ping } = require('./config/db');
  try {
    const ok = await ping();
    res.json({ ok, db: ok ? 'conectada' : 'sin respuesta', time: new Date().toISOString() });
  } catch (e) {
    res.status(503).json({ ok: false, db: 'error', message: e.message });
  }
});

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
