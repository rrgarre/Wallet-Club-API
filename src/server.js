// =====================================================================
//  Punto de entrada: valida la configuración, comprueba la BD remota y
//  arranca el servidor.
// =====================================================================
const { env, validarEnv } = require('./config/env');
const { validarCredenciales, ping, cerrarPool } = require('./config/db');

async function main() {
  // 1) Configuración (.env)
  validarEnv();
  validarCredenciales();

  // 2) Conexión con la base de datos remota (falla rápido si no hay BD)
  try {
    await ping();
    console.log(`[db] Conectado a ${process.env.DB_HOST}/${process.env.DB_NAME}`);
  } catch (err) {
    console.error(`[db] No se pudo conectar: ${err.message}`);
    console.error('[db] Revisa las credenciales de .env y que la BD remota sea accesible.');
    process.exit(1);
  }

  // 3) Servidor
  const app = require('./app');
  const server = app.listen(env.port, () => {
    console.log(`[api] Escuchando en http://localhost:${env.port}  (${env.nodeEnv})`);
  });

  // Cierre ordenado
  const cerrar = async (senal) => {
    console.log(`\n[api] Cierre por ${senal}...`);
    server.close(async () => {
      await cerrarPool();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => cerrar('SIGINT'));
  process.on('SIGTERM', () => cerrar('SIGTERM'));
}

main().catch((err) => {
  console.error('[fatal]', err.message || err);
  process.exit(1);
});
