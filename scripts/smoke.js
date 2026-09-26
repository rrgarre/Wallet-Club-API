// =====================================================================
//  SMOKE TEST  ->  npm run smoke
// ---------------------------------------------------------------------
//  Levanta la API real (Express + controllers + rutas + JWT + servicios)
//  contra una base de datos EN MEMORIA que emula el SQL que usa la API.
//  No sustituye a una prueba con MySQL real, pero valida de punta a punta:
//    rutas, autenticación, roles, registro por idRandomLargo, reglas de
//    movimiento, canje automático, idempotencia y atomicidad (rollback).
// =====================================================================
const assert = require('assert');

// ---------------------------------------------------------------
// 1) Stub de la capa de BD: se hace ANTES de cargar el resto
// ---------------------------------------------------------------
const connection = require('../src/db/connection');
const { hashPassword } = require('../src/utils/hash');

const store = {
  admins: [],
  comercios: [],
  tarjetas: [],
  operaciones: [],
  next: { admin: 1, comercio: 1, tarjeta: 1, operacion: 1 },
};

function safeTarjeta(t, sql) {
  if (/^SELECT \*/i.test(sql.trim())) return { ...t };
  const { passwordHash, ...resto } = t;
  return resto;
}

function run(sqlRaw, params = []) {
  const s = sqlRaw.replace(/\s+/g, ' ').trim();

  // ---- INSERT ----
  if (/^INSERT INTO tarjetas/i.test(s)) {
    const t = {
      id: store.next.tarjeta++,
      comercioId: params[0],
      nombre: params[1],
      email: params[2],
      puntos: params[3],
      premios: params[4],
      passwordHash: params[5],
      activo: params[6],
      createdAt: new Date().toISOString(),
      updatedAt: null,
    };
    store.tarjetas.push(t);
    return { kind: 'result', result: { insertId: t.id, affectedRows: 1 } };
  }
  if (/^INSERT INTO comercios/i.test(s)) {
    const c = {
      id: store.next.comercio++,
      nombre: params[0],
      puntosPremio: params[1],
      premioDescripcion: params[2],
      activo: params[3],
      idRandomLargo: params[4],
      passwordHash: params[5],
      createdAt: new Date().toISOString(),
      updatedAt: null,
    };
    store.comercios.push(c);
    return { kind: 'result', result: { insertId: c.id, affectedRows: 1 } };
  }
  if (/^INSERT INTO operaciones/i.test(s)) {
    const [tarjetaId, comercioId, tipo, puntosDelta, premiosDelta, descripcion, nombre, codigo, key] = params;
    if (key && store.operaciones.some((o) => o.tarjetaId === tarjetaId && o.idempotenciaKey === key)) {
      const e = new Error("Duplicate entry for key 'uq_operaciones_idem'");
      e.code = 'ER_DUP_ENTRY';
      throw e;
    }
    const o = {
      id: store.next.operacion++,
      tarjetaId,
      comercioId,
      tipo,
      puntosDelta,
      premiosDelta,
      descripcion,
      nombre,
      codigoCamarero: codigo,
      idempotenciaKey: key,
      createdAt: new Date().toISOString(),
    };
    store.operaciones.push(o);
    return { kind: 'result', result: { insertId: o.id, affectedRows: 1 } };
  }

  // ---- UPDATE ----
  if (/^UPDATE tarjetas SET googleWalletObjetoId = \? WHERE id = \?/i.test(s)) {
    const t = store.tarjetas.find((x) => x.id === params[1]);
    if (!t) return { kind: 'result', result: { affectedRows: 0 } };
    t.googleWalletObjetoId = params[0];
    t.updatedAt = new Date().toISOString();
    return { kind: 'result', result: { affectedRows: 1 } };
  }
  if (/^UPDATE tarjetas SET puntos = \?, premios = \? WHERE id = \?/i.test(s)) {
    const t = store.tarjetas.find((x) => x.id === params[2]);
    if (!t) return { kind: 'result', result: { affectedRows: 0 } };
    t.puntos = params[0];
    t.premios = params[1];
    t.updatedAt = new Date().toISOString();
    return { kind: 'result', result: { affectedRows: 1 } };
  }
  if (/^UPDATE comercios SET googleWalletClaseId = \?/i.test(s)) {
    const c = store.comercios.find((x) => x.id === params[2]);
    if (!c) return { kind: 'result', result: { affectedRows: 0 } };
    c.googleWalletClaseId = params[0];
    c.googleWalletClaseEstado = params[1];
    if (!c.googleWalletClaseCreadaEn) c.googleWalletClaseCreadaEn = new Date().toISOString();
    c.updatedAt = new Date().toISOString();
    return { kind: 'result', result: { affectedRows: 1 } };
  }
  if (/^UPDATE comercios SET /i.test(s)) {
    const ini = s.indexOf(' SET ') + 5;
    const fin = s.indexOf(' WHERE id = ?');
    const campos = s
      .slice(ini, fin)
      .split(',')
      .map((x) => x.split('=')[0].trim());
    const c = store.comercios.find((x) => x.id === params[params.length - 1]);
    if (!c) return { kind: 'result', result: { affectedRows: 0 } };
    campos.forEach((campo, i) => {
      c[campo] = params[i];
    });
    c.updatedAt = new Date().toISOString();
    return { kind: 'result', result: { affectedRows: 1 } };
  }
  if (/^UPDATE admins SET passwordHash = \? WHERE id = \?/i.test(s)) {
    const a = store.admins.find((x) => x.id === params[1]);
    if (a) a.passwordHash = params[0];
    return { kind: 'result', result: { affectedRows: a ? 1 : 0 } };
  }
  if (/^INSERT INTO admins/i.test(s)) {
    const a = { id: store.next.admin++, nombre: params[0], passwordHash: params[1], createdAt: new Date().toISOString() };
    store.admins.push(a);
    return { kind: 'result', result: { insertId: a.id, affectedRows: 1 } };
  }

  // ---- SELECT (transacción) ----
  if (/FROM tarjetas WHERE id = \? AND comercioId = \? FOR UPDATE/.test(s)) {
    const row = store.tarjetas.find((t) => t.id === params[0] && t.comercioId === params[1]);
    return { kind: 'rows', rows: row ? [{ ...row }] : [] };
  }
  if (/FROM tarjetas WHERE id = \? FOR UPDATE/.test(s)) {
    const row = store.tarjetas.find((t) => t.id === params[0]);
    return { kind: 'rows', rows: row ? [{ ...row }] : [] };
  }

  // ---- SELECT (pool) ----
  if (/COUNT\(\*\) AS total FROM operaciones/.test(s)) {
    return { kind: 'rows', rows: [{ total: store.operaciones.length }] };
  }
  if (/FROM operaciones WHERE tarjetaId = \? AND idempotenciaKey = \?/.test(s)) {
    const row = store.operaciones.find((o) => o.tarjetaId === params[0] && o.idempotenciaKey === params[1]);
    return { kind: 'rows', rows: row ? [{ ...row }] : [] };
  }
  if (/FROM operaciones WHERE tarjetaId = \? ORDER BY/.test(s)) {
    const limite = params[1] || 100;
    return {
      kind: 'rows',
      rows: store.operaciones.filter((o) => o.tarjetaId === params[0]).slice(-limite).reverse(),
    };
  }
  if (/FROM operaciones o LEFT JOIN/.test(s)) {
    const filas = [...store.operaciones].reverse().map((o) => {
      const t = store.tarjetas.find((x) => x.id === o.tarjetaId) || {};
      const c = store.comercios.find((x) => x.id === o.comercioId) || {};
      return { ...o, tarjetaNombre: t.nombre, tarjetaEmail: t.email, comercioNombre: c.nombre };
    });
    return { kind: 'rows', rows: filas };
  }
  if (/FROM admins WHERE nombre = \?/.test(s)) {
    const row = store.admins.find((a) => a.nombre === params[0]);
    return { kind: 'rows', rows: row ? [{ ...row }] : [] };
  }
  if (/FROM admins WHERE id = \?/.test(s)) {
    const { passwordHash, ...resto } = store.admins.find((a) => a.id === params[0]) || {};
    return { kind: 'rows', rows: resto.id ? [resto] : [] };
  }
  if (/FROM admins/.test(s)) {
    return { kind: 'rows', rows: store.admins.map(({ passwordHash, ...r }) => r) };
  }
  if (/FROM comercios WHERE idRandomLargo = \?/.test(s)) {
    const row = store.comercios.find((c) => c.idRandomLargo === params[0]);
    return { kind: 'rows', rows: row ? [{ ...row }] : [] };
  }
  if (/FROM comercios WHERE nombre = \?/.test(s)) {
    const row = store.comercios.find((c) => c.nombre === params[0]);
    return { kind: 'rows', rows: row ? [{ ...row }] : [] };
  }
  if (/FROM comercios WHERE id = \?/.test(s)) {
    const row = store.comercios.find((c) => c.id === Number(params[0]));
    if (!row) return { kind: 'rows', rows: [] };
    if (/^SELECT \*/i.test(s.trim())) return { kind: 'rows', rows: [{ ...row }] };
    const { passwordHash, ...resto } = row;
    return { kind: 'rows', rows: [resto] };
  }
  if (/FROM comercios ORDER BY nombre/.test(s)) {
    return {
      kind: 'rows',
      rows: store.comercios.map(({ passwordHash, ...r }) => r),
    };
  }
  if (/FROM tarjetas WHERE email = \? AND comercioId = \?/.test(s)) {
    const row = store.tarjetas.find((t) => t.email === params[0] && t.comercioId === Number(params[1]));
    return { kind: 'rows', rows: row ? [{ ...row }] : [] };
  }
  if (/FROM tarjetas WHERE email = \?/.test(s)) {
    const filas = store.tarjetas.filter((t) => t.email === params[0]);
    return { kind: 'rows', rows: filas }; // >1 => el controller lanza EMAIL_AMBIGUO
  }
  if (/FROM tarjetas WHERE id = \?/.test(s)) {
    const row = store.tarjetas.find((t) => t.id === Number(params[0]));
    return { kind: 'rows', rows: row ? [safeTarjeta(row, s)] : [] };
  }
  if (/FROM tarjetas WHERE comercioId = \?/.test(s)) {
    return {
      kind: 'rows',
      rows: store.tarjetas
        .filter((t) => t.comercioId === Number(params[0]))
        .map((t) => safeTarjeta(t, s)),
    };
  }
  if (/FROM tarjetas ORDER BY/.test(s)) {
    return { kind: 'rows', rows: store.tarjetas.map((t) => safeTarjeta(t, s)) };
  }

  const e = new Error(`SQL no soportado por el smoke test: ${s}`);
  e.code = 'SMOKE_SQL_NO_SOPORTADO';
  throw e;
}

function paquete(sql, params) {
  const r = run(sql, params);
  return r.kind === 'rows' ? [r.rows] : [r.result];
}

// Los db/* desestructuran query/get/execute de ESTE módulo, así que hay
// que parchearlos ANTES de cargar el resto de la API.
//   - query  -> devuelve las filas (como hace src/db/connection.js)
//   - get    -> primera fila
//   - execute-> resultado del INSERT/UPDATE
//   - conn.query (transacción) -> forma cruda [rows] / [result] de mysql2
connection.query = async (sql, params) => paquete(sql, params)[0];
connection.get = async (sql, params) => paquete(sql, params)[0][0];
connection.execute = async (sql, params) => paquete(sql, params)[0];
connection.withTransaction = async (fn) => {
  const snapshot = structuredClone(store);
  const conn = { query: async (sql, params) => paquete(sql, params) };
  try {
    return await fn(conn);
  } catch (err) {
    // Emula el ROLLBACK: nada de lo que ocurrió dentro se queda.
    Object.assign(store, snapshot);
    throw err;
  }
};

// ---------------------------------------------------------------
// 2) Datos iniciales
// ---------------------------------------------------------------
async function seed() {
  store.admins.push({
    id: store.next.admin++,
    nombre: 'admin',
    passwordHash: await hashPassword('Admin1234'),
    createdAt: new Date().toISOString(),
  });
  store.comercios.push(
    {
      id: store.next.comercio++,
      nombre: 'Café Central',
      puntosPremio: 10,
      premioDescripcion: 'Café gratis',
      activo: 1,
      idRandomLargo: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6',
      passwordHash: await hashPassword('Comercio123'),
      createdAt: new Date().toISOString(),
      updatedAt: null,
    },
    {
      id: store.next.comercio++,
      nombre: 'Bar Cerrado',
      puntosPremio: 5,
      premioDescripcion: null,
      activo: 0,
      idRandomLargo: 'f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1',
      passwordHash: await hashPassword('Comercio123'),
      createdAt: new Date().toISOString(),
      updatedAt: null,
    }
  );
  store.tarjetas.push(
    {
      id: store.next.tarjeta++,
      comercioId: 1,
      nombre: 'Luis',
      email: 'luis@x.com',
      puntos: 0,
      premios: 0,
      passwordHash: await hashPassword('Tarjeta123'),
      activo: 1,
      createdAt: new Date().toISOString(),
      updatedAt: null,
    },
    {
      id: store.next.tarjeta++,
      comercioId: 2,
      nombre: 'Otra',
      email: 'otro@x.com',
      puntos: 0,
      premios: 0,
      passwordHash: await hashPassword('Tarjeta123'),
      activo: 1,
      createdAt: new Date().toISOString(),
      updatedAt: null,
    }
  );
}

// ---------------------------------------------------------------
// 3) Runner del smoke test
// ---------------------------------------------------------------
let base;
const resultados = [];

async function req(metodo, ruta, { token, body, headers } = {}) {
  const res = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers || {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch (_) {
    /* sin body */
  }
  if (process.env.DEBUG_SMOKE && res.status >= 400) {
    console.log(`    [debug] ${metodo} ${ruta} -> ${res.status} ${JSON.stringify(json)}`);
  }
  return { status: res.status, json };
}

function check(nombre, cond, extra = '') {
  resultados.push({ nombre, ok: !!cond, extra });
  console.log(`${cond ? '  OK  ' : ' FALLA'}  ${nombre}${extra ? `  ${extra}` : ''}`);
}

async function main() {
  await seed();

  // ---------------------------------------------------------------
  // Stub del servicio de Google Wallet (no llamamos a Google de verdad)
  // ---------------------------------------------------------------
  const googleWalletStub = require('../src/services/googleWalletService');
  const generarEnlaceReal = googleWalletStub.generarEnlaceTarjeta; // builder real (sin red)
  const { env } = require('../src/config/env');
  const ultimaLlamada = { params: null };
  googleWalletStub.crearClase = async (params) => {
    ultimaLlamada.params = params;
    const claseId = `${env.googleWallet.issuerId}.${params.idRandomLargo}`;
    if (global.__GW_YA_EXISTE) return { creada: false, claseId, clase: null };
    return { creada: true, claseId, clase: { id: claseId, reviewStatus: params.reviewStatus } };
  };
  googleWalletStub.obtenerClase = async () => ({ reviewStatus: 'UNDER_REVIEW' });
  googleWalletStub.generarEnlaceTarjeta = ({ claseId, tarjeta, comercio }) => ({
    url: `https://pay.google.com/gp/v/save/FAKE_${tarjeta.id}`,
    objectId: `${env.googleWallet.issuerId}.USER_${tarjeta.id}_COMERCIO_${comercio.idRandomLargo}`,
    qrUrl: env.frontUrl ? `${env.frontUrl}/comercio/captura/${tarjeta.id}` : '',
  });
  // PATCH de saldos: sin red; controlable con globals para los tests
  global.__ULTIMA_SYNC = null;
  googleWalletStub.actualizarSaldos = async ({ objectId, puntos, premios }) => {
    global.__ULTIMA_SYNC = { objectId, puntos, premios };
    if (global.__GW_SYNC_FALLO) throw new Error('falso: Google no responde');
    if (global.__GW_SYNC_SIN_OBJETO) return 'sin_objeto';
    return 'sincronizado';
  };

  const app = require('../src/app');
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;

  // ---------------- PÚBLICOS ----------------
  let r = await req('POST', '/api/auth/admin/login', { body: { nombre: 'admin', password: 'Admin1234' } });
  check('login admin ok', r.status === 200 && r.json.token, `(${r.status})`);
  const tAdmin = r.json.token;

  r = await req('POST', '/api/auth/admin/login', { body: { nombre: 'admin', password: 'mala' } });
  check('login admin password mala -> 401', r.status === 401, `(${r.status})`);

  r = await req('POST', '/api/auth/comercio/login', {
    body: { idRandomLargo: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6', password: 'Comercio123' },
  });
  check('login comercio ok', r.status === 200 && r.json.token, `(${r.status})`);
  const tComercio = r.json.token;

  r = await req('POST', '/api/auth/comercio/login', {
    body: { idRandomLargo: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6', password: 'otra' },
  });
  check('login comercio password mala -> 401 (idRandom no es credencial)', r.status === 401, `(${r.status})`);

  r = await req('POST', '/api/auth/comercio/login', {
    body: { idRandomLargo: 'f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1', password: 'Comercio123' },
  });
  check('login comercio inactivo -> 403', r.status === 403, `(${r.status})`);
  // Token legítimo de un comercio que DESPUÉS se desactivó (para probar el bloqueo en ruta)
  const { firmarToken } = require('../src/middlewares/auth');
  const tComercioInactivo = firmarToken({ sub: 2, role: 'comercio', nombre: 'Bar Cerrado' });

  r = await req('POST', '/api/auth/tarjeta/login', { body: { email: 'luis@x.com', password: 'Tarjeta123' } });
  check(
    'login tarjeta ok (con googleWalletUrl null: aún sin clase)',
    r.status === 200 && r.json.token && r.json.googleWalletUrl === null && r.json.usuario.googleWalletObjetoId === null,
    `(${r.status}, gw=${r.json?.googleWalletUrl})`
  );
  const tTarjeta = r.json.token;

  // Registro con idRandomLargo en la URL (la comercioId la deduce el controller)
  r = await req('POST', '/api/registro/tarjeta/no-existe', {
    body: { nombre: 'Nulo', email: 'nulo@x.com', password: 'secreto1' },
  });
  check('registro con idRandomLargo inexistente -> 400', r.status === 400, `(${r.status})`);

  r = await req('POST', '/api/registro/tarjeta/f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1', {
    body: { nombre: 'Nuevo', email: 'nuevo@x.com', password: 'secreto1' },
  });
  check('registro en comercio inactivo -> 403', r.status === 403, `(${r.status})`);

  r = await req('POST', '/api/registro/tarjeta/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6', {
    body: { nombre: 'Nuevo', email: 'nuevo@x.com', password: 'secreto1' },
  });
  check(
    'registro tarjeta ok -> comercioId deducida = 1',
    r.status === 201 && r.json.usuario.comercioId === 1 && r.json.token,
    `(${r.status}, comercioId=${r.json?.usuario?.comercioId})`
  );
  const tNuevo = r.json.token;
  const idNuevo = r.json.usuario.id;

  // Mismo email pero OTRA contraseña => conflicto real (como siempre)
  r = await req('POST', '/api/registro/tarjeta/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6', {
    body: { nombre: 'Nuevo', email: 'nuevo@x.com', password: 'claveDistinta1' },
  });
  check('registro email duplicado con contraseña distinta -> 400', r.status === 400, `(${r.status})`);

  // REANUDACIÓN: mismo email + MISMA contraseña => 201 con la MISMA tarjeta
  const filasAntes = store.tarjetas.filter((t) => t.comercioId === 1).length;
  r = await req('POST', '/api/registro/tarjeta/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6', {
    body: { nombre: 'Nombre Ignorado', email: 'nuevo@x.com', password: 'secreto1' },
  });
  const filasDespues = store.tarjetas.filter((t) => t.comercioId === 1).length;
  check(
    'reanudación con misma contraseña -> 201 y MISMA tarjeta',
    r.status === 201 && r.json.usuario.id === idNuevo && r.json.token,
    `(${r.status}, id=${r.json?.usuario?.id} esperado ${idNuevo})`
  );
  check(
    'reanudación NO crea filas nuevas',
    filasAntes === filasDespues,
    `(${filasAntes} -> ${filasDespues})`
  );
  check(
    'reanudación conserva nombre y saldos originales',
    r.json.usuario.nombre === 'Nuevo' && r.json.usuario.puntos === 0 && r.json.usuario.premios === 0,
    `(nombre=${r.json?.usuario?.nombre}, p=${r.json?.usuario?.puntos})`
  );

  r = await req('POST', '/api/auth/tarjeta/login', {
    body: { email: 'nuevo@x.com', password: 'secreto1', comercioId: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6' },
  });
  check('login tarjeta aceptando idRandomLargo como comercioId', r.status === 200, `(${r.status})`);

  // ---------------- CONTROL DE ACCESO ----------------
  r = await req('GET', '/api/tarjeta/perfil');
  check('sin token -> 401', r.status === 401, `(${r.status})`);

  r = await req('GET', '/api/admin/comercios', { token: tTarjeta });
  check('rol tarjeta en ruta admin -> 403', r.status === 403, `(${r.status})`);

  r = await req('GET', '/api/tarjeta/perfil', { token: tTarjeta });
  check(
    'perfil tarjeta sin passwordHash',
    r.status === 200 && r.json.tarjeta.email === 'luis@x.com' && !('passwordHash' in r.json.tarjeta),
    `(${r.status})`
  );

  // ---------------- MOVIMIENTOS ----------------
  const mov = (id, body, token = tComercio, headers) =>
    req('POST', `/api/comercio/tarjetas/${id}/movimiento`, { body, token, headers });

  r = await mov(1, { puntosDelta: 25, premiosDelta: 0, idempotencia: 'op-001' });
  check(
    'acumulación +25 con umbral 10 -> 5 puntos y 2 premios',
    r.status === 201 && r.json.tarjeta.puntos === 5 && r.json.tarjeta.premios === 2 && r.json.conversion.n === 2,
    `(${r.status}, p=${r.json?.tarjeta?.puntos}, prem=${r.json?.tarjeta?.premios})`
  );

  r = await mov(1, { puntosDelta: 25, premiosDelta: 0, idempotencia: 'op-001' });
  check(
    'reintento con misma idempotencia -> duplicado y sin cambios',
    r.status === 200 && r.json.duplicado === true && r.json.tarjeta.puntos === 5 && r.json.tarjeta.premios === 2,
    `(${r.status}, dup=${r.json?.duplicado})`
  );
  const opsTrasDup = store.operaciones.length;
  check('el reintento no crea operaciones nuevas', store.operaciones.length === 2, `(${store.operaciones.length})`);

  r = await mov(1, { puntosDelta: 0, premiosDelta: 25, idempotencia: 'op-001' });
  check(
    'misma idempotencia con payload distinto -> 409 IDEMPOTENCIA_CONFLICTO',
    r.status === 409 && r.json.error.code === 'IDEMPOTENCIA_CONFLICTO' && store.operaciones.length === opsTrasDup,
    `(${r.status})`
  );

  r = await mov(1, { puntosDelta: 0, premiosDelta: 1, idempotencia: 'op-002' });
  check('sumar premios sin nombre -> 400 NOMBRE_REQUERIDO', r.status === 400 && r.json.error.code === 'NOMBRE_REQUERIDO', `(${r.status})`);

  r = await mov(1, { puntosDelta: 0, premiosDelta: 1, nombre: 'Ana', codigoCamarero: 'ANA-01', idempotencia: 'op-003' });
  check(
    'sumar premios con nombre+camarero -> ok (premios 3)',
    r.status === 201 && r.json.tarjeta.premios === 3,
    `(${r.status}, prem=${r.json?.tarjeta?.premios})`
  );
  check(
    'la operación guarda nombre y código',
    store.operaciones.some((o) => o.idempotenciaKey === 'op-003' && o.nombre === 'Ana' && o.codigoCamarero === 'ANA-01')
  );

  r = await mov(1, { puntosDelta: 0, premiosDelta: -10, idempotencia: 'op-004' });
  check('canje de 10 premios con sólo 3 -> 400 PREMIOS_NEGATIVOS', r.status === 400 && r.json.error.code === 'PREMIOS_NEGATIVOS', `(${r.status})`);

  r = await mov(1, { puntosDelta: -5, premiosDelta: 0, idempotencia: 'op-005' });
  check('restar puntos sin nombre -> 400 NOMBRE_REQUERIDO', r.status === 400 && r.json.error.code === 'NOMBRE_REQUERIDO', `(${r.status})`);

  r = await mov(1, { puntosDelta: -5, premiosDelta: 0, nombre: 'Ana', codigoCamarero: 'ANA-01', idempotencia: 'op-006' });
  check('restar puntos con nombre -> ok (puntos 0)', r.status === 201 && r.json.tarjeta.puntos === 0, `(${r.status}, p=${r.json?.tarjeta?.puntos})`);

  r = await mov(1, { puntosDelta: 0, premiosDelta: -3, idempotencia: 'op-007' });
  check('canje estándar de 3 premios (sin nombre) -> ok', r.status === 201 && r.json.tarjeta.premios === 0, `(${r.status})`);

  r = await mov(1, { puntosDelta: 150, premiosDelta: 0, idempotencia: 'op-008' });
  check('incremento grande (> UMBRAL_PUNTOS_NOMBRE=100) sin nombre -> 400', r.status === 400 && r.json.error.code === 'NOMBRE_REQUERIDO', `(${r.status})`);

  r = await mov(1, { puntosDelta: 150, premiosDelta: 0, nombre: 'Ana', codigoCamarero: 'ANA-01', idempotencia: 'op-009' });
  check(
    'incremento grande con nombre -> n=15 conversiones, puntos 0, premios 15',
    r.status === 201 && r.json.tarjeta.puntos === 0 && r.json.tarjeta.premios === 15 && r.json.conversion.n === 15,
    `(${r.status}, p=${r.json?.tarjeta?.puntos}, prem=${r.json?.tarjeta?.premios})`
  );

  // El libro debe cuadrar con los saldos
  const sumaPts = store.operaciones.reduce((a, o) => a + o.puntosDelta, 0);
  const sumaPrem = store.operaciones.reduce((a, o) => a + o.premiosDelta, 0);
  check(
    'libro de operaciones cuadra con los saldos',
    sumaPts === store.tarjetas[0].puntos && sumaPrem === store.tarjetas[0].premios,
    `(puntos ${sumaPts}/${store.tarjetas[0].puntos}, premios ${sumaPrem}/${store.tarjetas[0].premios})`
  );

  r = await mov(1, { puntosDelta: 0, premiosDelta: 0, idempotencia: 'op-010' });
  check('operación sin efecto -> 400', r.status === 400, `(${r.status})`);

  // ---------------- PERMISOS ENTRE COMERCIOS ----------------
  r = await req('GET', '/api/comercio/tarjetas/2', { token: tComercio });
  check('tarjeta de otro comercio -> 404', r.status === 404, `(${r.status})`);

  r = await mov(2, { puntosDelta: 10, premiosDelta: 0, idempotencia: 'op-011' }, tComercio);
  check('mover tarjeta ajena -> 404 (y no toca saldos)', r.status === 404 && store.tarjetas[1].puntos === 0, `(${r.status})`);

  r = await req('GET', '/api/comercio/tarjetas', { token: tComercioInactivo });
  check('comercio inactivo -> 403 en rutas propias', r.status === 403 && r.json.error.code === 'COMERCIO_INACTIVO', `(${r.status})`);

  r = await req('GET', '/api/comercio/tarjetas');
  check('rutas de comercio sin token -> 401', r.status === 401, `(${r.status})`);

  r = await req('GET', '/api/comercio/tarjetas', { token: tTarjeta });
  check('rol tarjeta en rutas de comercio -> 403', r.status === 403, `(${r.status})`);

  // ---------------- ADMIN ----------------
  r = await req('GET', '/api/comercio/tarjetas');
  check('admin no infiere comercio sin indicarlo -> 401/403', r.status === 401 || r.status === 403, `(${r.status})`);

  r = await req('GET', '/api/comercio/tarjetas?comercioId=1', { token: tAdmin });
  check('admin accede a rutas de comercio indicando comercioId', r.status === 200 && r.json.total === 2, `(${r.status}, total=${r.json?.total})`);

  r = await req('GET', '/api/comercio/tarjetas', { token: tAdmin });
  check('admin sin comercioId -> 400', r.status === 400 && r.json.error.code === 'COMERCIO_REQUERIDO', `(${r.status})`);

  r = await req('GET', '/api/admin/comercios', { token: tAdmin });
  check('admin lista comercios', r.status === 200 && r.json.total === 2, `(${r.status}, total=${r.json?.total})`);

  r = await req('GET', '/api/admin/comercios/999', { token: tAdmin });
  check('admin comercio inexistente -> 404', r.status === 404, `(${r.status})`);

  r = await req('POST', '/api/admin/comercios', {
    token: tAdmin,
    body: { nombre: 'Panadería Sol', password: 'Panaderia1', puntosPremio: 7, premioDescripcion: 'Pan gratis' },
  });
  check(
    'admin crea comercio -> idRandomLargo de 48',
    r.status === 201 && r.json.comercio.idRandomLargo.length === 48 && !('passwordHash' in r.json.comercio),
    `(${r.status})`
  );
  const nuevoIdRandom = r.json?.comercio?.idRandomLargo;

  r = await req('PATCH', '/api/admin/comercios/1', { token: tAdmin, body: { puntosPremio: 12, activo: false } });
  check('admin edita comercio', r.status === 200 && r.json.comercio.puntosPremio === 12 && r.json.comercio.activo === 0, `(${r.status})`);

  r = await req('PATCH', '/api/admin/comercios/1', { token: tAdmin, body: { activo: true, puntosPremio: 10 } });
  check('admin reactiva comercio', r.status === 200 && r.json.comercio.activo === 1, `(${r.status})`);

  r = await req('GET', '/api/admin/tarjetas', { token: tAdmin });
  check('admin lista tarjetas', r.status === 200 && r.json.total === 3, `(${r.status}, total=${r.json?.total})`);

  r = await req('GET', '/api/admin/tarjetas/1', { token: tAdmin });
  check('admin ve tarjeta por id sin passwordHash', r.status === 200 && !('passwordHash' in r.json.tarjeta), `(${r.status})`);

  r = await req('GET', '/api/admin/tarjetas?comercioId=1', { token: tAdmin });
  check('admin filtra tarjetas por comercio', r.status === 200 && r.json.total === 2, `(${r.status}, total=${r.json?.total})`);

  r = await req('GET', '/api/admin/operaciones?tarjetaId=1', { token: tAdmin });
  check('admin lista operaciones', r.status === 200 && r.json.total >= 7, `(${r.status}, total=${r.json?.total})`);

  r = await req('GET', '/api/admin/operaciones', { token: tComercio });
  check('comercio no puede listar operaciones globales -> 403', r.status === 403, `(${r.status})`);

  // Con el comercio recién creado, repetir el alta por idRandomLargo
  if (nuevoIdRandom) {
    r = await req('POST', `/api/registro/tarjeta/${nuevoIdRandom}`, {
      body: { nombre: 'Cliente Sol', email: 'sol@x.com', password: 'secreto1' },
    });
    check(
      'registro con idRandomLargo recién creado -> comercioId nueva',
      r.status === 201 && r.json.usuario.comercioId === 3,
      `(${r.status}, comercioId=${r.json?.usuario?.comercioId})`
    );
  }

  r = await req('GET', '/api/tarjeta/perfil', { token: tNuevo });
  check('token de tarjeta recién registrada -> perfil ok', r.status === 200, `(${r.status})`);

  r = await req('GET', '/health');
  // 200 si hay BD; 503 si no está accesible (aquí no hay MySQL real)
  check('health responde', r.status === 200 || r.status === 503, `(${r.status})`);

  // ---------------- GOOGLE WALLET (clase) ----------------
  const CLASE_IDR = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6';
  const crearClase = (idR, body, token) =>
    req('POST', `/api/admin/comercios/${idR}/google-wallet/clase`, { body, token });
  const claseBody = {
    imgLogo: 'https://ejemplo.com/logo.png',
    imgHero: 'https://ejemplo.com/hero.png',
    imgModulo: 'https://ejemplo.com/foto.png',
    hexBackgroundColor: '#0B57D0',
    terminosTexto: '1 punto por cada 1 € comprado.',
  };

  r = await crearClase(CLASE_IDR, claseBody);
  check('clase sin token -> 401', r.status === 401, `(${r.status})`);

  r = await crearClase(CLASE_IDR, claseBody, tComercio);
  check('rol comercio en ruta admin de clase -> 403', r.status === 403, `(${r.status})`);

  r = await crearClase(CLASE_IDR, claseBody, tTarjeta);
  check('rol tarjeta en ruta admin de clase -> 403', r.status === 403, `(${r.status})`);

  r = await crearClase('no-existe', claseBody, tAdmin);
  check('clase para idRandomLargo inexistente -> 404', r.status === 404 && r.json.error.code === 'COMERCIO_NOT_FOUND', `(${r.status})`);

  r = await crearClase(CLASE_IDR, { ...claseBody, imgLogo: undefined }, tAdmin);
  check('clase sin imgLogo -> 400 VALIDATION', r.status === 400 && r.json.error.code === 'VALIDATION', `(${r.status})`);

  r = await crearClase(CLASE_IDR, { ...claseBody, imgLogo: 'http://inseguro.com/logo.png' }, tAdmin);
  check('clase con imgLogo no-HTTPS -> 400', r.status === 400 && r.json.error.code === 'VALIDATION', `(${r.status})`);

  r = await crearClase(CLASE_IDR, { ...claseBody, hexBackgroundColor: 'azul' }, tAdmin);
  check('clase con color inválido -> 400', r.status === 400 && r.json.error.code === 'VALIDATION', `(${r.status})`);

  r = await crearClase(CLASE_IDR, { ...claseBody, reviewStatus: 'LISTO' }, tAdmin);
  check('clase con reviewStatus inválido -> 400', r.status === 400 && r.json.error.code === 'VALIDATION', `(${r.status})`);

  r = await crearClase(CLASE_IDR, { imgLogo: claseBody.imgLogo, terminosTexto: '' }, tAdmin);
  check('clase sin terminosTexto -> 400', r.status === 400 && r.json.error.code === 'VALIDATION', `(${r.status})`);

  // Color NO enviado -> el campo se omite (Google usa el color del hero)
  r = await crearClase(CLASE_IDR, { ...claseBody, hexBackgroundColor: undefined }, tAdmin);
  check(
    'clase creada sin hexBackgroundColor -> 201 y id = issuerId.idRandom',
    r.status === 201 && r.json.clase.id === `${env.googleWallet.issuerId}.${CLASE_IDR}`,
    `(${r.status}, id=${r.json?.clase?.id})`
  );
  check(
    'el builder recibe el comercio y omite el color si no viene',
    ultimaLlamada.params.comercio.nombre === 'Café Central' &&
      ultimaLlamada.params.idRandomLargo === CLASE_IDR &&
      ultimaLlamada.params.hexBackgroundColor === null
  );
  // Comprobación del constructor REAL (sin red): textos derivados del comercio
  const cuerpoReal = googleWalletStub.construirClase({
    comercio: store.comercios.find((c) => c.idRandomLargo === CLASE_IDR),
    idRandomLargo: CLASE_IDR,
    imgLogo: claseBody.imgLogo,
    imgHero: null,
    imgModulo: null,
    hexBackgroundColor: null,
    terminosTexto: claseBody.terminosTexto,
    reviewStatus: 'UNDER_REVIEW',
  });
  check(
    'construirClase: issuerName = nombre y programName = "Fidelización " + nombre',
    cuerpoReal.issuerName === 'Café Central' &&
      cuerpoReal.programName === 'Fidelización Café Central' &&
      cuerpoReal.programLogo.sourceUri.uri === claseBody.imgLogo &&
      !('hexBackgroundColor' in cuerpoReal) &&
      !('heroImage' in cuerpoReal) &&
      cuerpoReal.textModulesData[0].body === claseBody.terminosTexto
  );
  check(
    'la clase creada se guarda en el comercio',
    store.comercios.find((c) => c.idRandomLargo === CLASE_IDR)?.googleWalletClaseId ===
      `${env.googleWallet.issuerId}.${CLASE_IDR}`,
    `(claseId=${store.comercios.find((c) => c.idRandomLargo === CLASE_IDR)?.googleWalletClaseId})`
  );
  check(
    'googleWalletClaseCreadaEn se rellena en la primera creación',
    !!store.comercios.find((c) => c.idRandomLargo === CLASE_IDR)?.googleWalletClaseCreadaEn
  );
  check('en la respuesta va el comercio actualizado', !!r.json.comercio?.googleWalletClaseId, `(estado=${r.json?.comercio?.googleWalletClaseEstado})`);

  r = await req('GET', '/api/admin/comercios/1', { token: tAdmin });
  check('GET admin comercio expone googleWalletClaseId', r.status === 200 && 'googleWalletClaseId' in r.json.comercio, `(${r.status})`);

  // Segundo envío del mismo formulario -> conflicto visible para el front
  global.__GW_YA_EXISTE = true;
  r = await crearClase(CLASE_IDR, claseBody, tAdmin);
  check(
    'clase repetida -> 409 GOOGLE_CLASE_YA_EXISTE',
    r.status === 409 && r.json.error.code === 'GOOGLE_CLASE_YA_EXISTE' && r.json.error.message.includes(env.googleWallet.issuerId),
    `(${r.status}, code=${r.json?.error?.code})`
  );
  global.__GW_YA_EXISTE = false;

  // ---------------- TARJETAS / OBJETOS (enlace "Añadir a Wallet") ----------------
  // Comercio 1 SIN clase todavía: el alta funciona y googleWalletUrl queda null
  store.comercios[0].googleWalletClaseId = null;
  r = await req('POST', '/api/registro/tarjeta/' + CLASE_IDR, {
    body: { nombre: 'Sin Clase', email: 'sinclase@x.com', password: 'secreto1' },
  });
  check(
    'registro en comercio SIN clase -> 201 con googleWalletUrl null',
    r.status === 201 && r.json.googleWalletUrl === null && r.json.usuario.googleWalletObjetoId === null,
    `(${r.status}, url=${r.json?.googleWalletUrl})`
  );

  // Le asignamos clase y estado DRAFT: Google aún no admite tarjetas
  store.comercios[0].googleWalletClaseId = `${env.googleWallet.issuerId}.${CLASE_IDR}`;
  store.comercios[0].googleWalletClaseEstado = 'DRAFT';
  r = await req('POST', '/api/registro/tarjeta/' + CLASE_IDR, {
    body: { nombre: 'Draft', email: 'draft@x.com', password: 'secreto1' },
  });
  check(
    'clase en DRAFT -> alta ok pero googleWalletUrl null',
    r.status === 201 && r.json.googleWalletUrl === null,
    `(${r.status}, url=${r.json?.googleWalletUrl})`
  );

  // Clase aprobada: sí debe salir el enlace
  store.comercios[0].googleWalletClaseEstado = 'approved';
  r = await req('POST', '/api/registro/tarjeta/' + CLASE_IDR, {
    body: { nombre: 'Con Wallet', email: 'wallet@x.com', password: 'secreto1' },
  });
  check(
    'registro con clase aprobada -> 201 con googleWalletUrl',
    r.status === 201 && /^https:\/\/pay\.google\.com\/gp\/v\/save\//.test(r.json.googleWalletUrl),
    `(${r.status}, url=${String(r.json?.googleWalletUrl).slice(0, 60)}...)`
  );
  const nuevaWallet = r.json;
  check(
    'el objeto de Google se guarda en la tarjeta',
    nuevaWallet.usuario.googleWalletObjetoId ===
      `${env.googleWallet.issuerId}.USER_${nuevaWallet.usuario.id}_COMERCIO_${CLASE_IDR}`,
    `(objetoId=${nuevaWallet.usuario.googleWalletObjetoId})`
  );
  check(
    'la fila en BD tiene googleWalletObjetoId',
    !!store.tarjetas.find((t) => t.id === nuevaWallet.usuario.id)?.googleWalletObjetoId
  );

  // ---- REANUDACIÓN + LOGIN con clase aprobada (reemisión del enlace) ----
  r = await req('POST', '/api/auth/tarjeta/login', {
    body: { email: 'wallet@x.com', password: 'secreto1' },
  });
  check(
    'login tarjeta con clase aprobada -> googleWalletUrl string',
    r.status === 200 &&
      /^https:\/\/pay\.google\.com\/gp\/v\/save\//.test(r.json.googleWalletUrl) &&
      r.json.usuario.googleWalletObjetoId === nuevaWallet.usuario.googleWalletObjetoId,
    `(${r.status}, gw=${String(r.json?.googleWalletUrl).slice(0, 50)}...)`
  );

  // El "callejón sin salida": repetir el alta tras no haber guardado la tarjeta
  const filasWalletAntes = store.tarjetas.filter((t) => t.comercioId === 1).length;
  r = await req('POST', '/api/registro/tarjeta/' + CLASE_IDR, {
    body: { nombre: 'Otra Vez', email: 'wallet@x.com', password: 'secreto1' },
  });
  const filasWalletDespues = store.tarjetas.filter((t) => t.comercioId === 1).length;
  check(
    'reanudación del alta con clase aprobada -> 201 con enlace nuevo',
    r.status === 201 &&
      r.json.usuario.id === nuevaWallet.usuario.id &&
      /^https:\/\/pay\.google\.com\/gp\/v\/save\//.test(r.json.googleWalletUrl),
    `(${r.status}, id=${r.json?.usuario?.id}, gw=${String(r.json?.googleWalletUrl).slice(0, 40)}...)`
  );
  check(
    'la reanudación del alta no duplica la fila',
    filasWalletAntes === filasWalletDespues,
    `(${filasWalletAntes} -> ${filasWalletDespues})`
  );

  // El enlace firmado con el builder REAL debe llevar el objeto correcto
  if (env.googleWallet.issuerId && env.frontUrl) {
    try {
      const enlaceReal = generarEnlaceReal({
        claseId: store.comercios[0].googleWalletClaseId,
        tarjeta: { id: 7, nombre: 'Luis', puntos: 4, premios: 1 },
        comercio: store.comercios[0],
      });
      // El token va DESPUÉS del último '/': el dominio también tiene puntos
      const jwtTarjeta = enlaceReal.url.split('/').pop();
      const payload = JSON.parse(
        Buffer.from(
          jwtTarjeta.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'),
          'base64'
        ).toString()
      );
      const obj = payload.payload.loyaltyObjects[0];
      check(
        'builder real: JWT savetowallet con el objeto correcto',
        payload.typ === 'savetowallet' &&
          obj.id === `${env.googleWallet.issuerId}.USER_7_COMERCIO_${CLASE_IDR}` &&
          obj.classId === store.comercios[0].googleWalletClaseId &&
          obj.state === 'ACTIVE' &&
          obj.accountId === '7' &&
          obj.accountName === 'Luis' &&
          obj.barcode.value === `${env.frontUrl}/comercio/captura/7` &&
          obj.loyaltyPoints.balance.int === 4 &&
          obj.secondaryLoyaltyPoints.balance.int === 1
      );
    } catch (e) {
      check('builder real: JWT savetowallet con el objeto correcto', false, e.message);
    }
  } else {
    check('builder real: (omitido, faltan GOOGLE_WALLET_ISSUER_ID / FRONT_URL en .env)', true);
  }

  // ---------------- SINCRONIZACIÓN DE SALDOS (PATCH a Google) ----------------
  const idWallet = nuevaWallet.usuario.id; // tarjeta CON objeto de Google
  const movGw = (id, body, token = tComercio) =>
    req('POST', `/api/comercio/tarjetas/${id}/movimiento`, { body, token });

  // Tarjeta SIN objeto de Google (la primera, 'Luis')
  r = await movGw(1, { puntosDelta: 1, premiosDelta: 0, idempotencia: 'gw-004' });
  check(
    'tarjeta sin googleWalletObjetoId -> googleWallet null',
    r.status === 201 && r.json.googleWallet === null,
    `(${r.status}, gw=${r.json?.googleWallet})`
  );

  // Tarjeta CON objeto: sincronización correcta
  r = await movGw(idWallet, { puntosDelta: 3, premiosDelta: 0, idempotencia: 'gw-001' });
  check(
    'movimiento con objeto en Wallet -> googleWallet "sincronizado"',
    r.status === 201 && r.json.googleWallet === 'sincronizado',
    `(${r.status}, gw=${r.json?.googleWallet})`
  );
  check(
    'el PATCH lleva el objectId y los saldos NUEVOS',
    global.__ULTIMA_SYNC &&
      global.__ULTIMA_SYNC.objectId === nuevaWallet.usuario.googleWalletObjetoId &&
      global.__ULTIMA_SYNC.puntos === 3 &&
      global.__ULTIMA_SYNC.premios === 0,
    JSON.stringify(global.__ULTIMA_SYNC)
  );

  // Google caído: el movimiento se aplica igual y se informa 'error'
  global.__GW_SYNC_FALLO = true;
  r = await movGw(idWallet, { puntosDelta: 3, premiosDelta: 0, idempotencia: 'gw-002' });
  check(
    'Google no responde -> movimiento 201 y googleWallet "error"',
    r.status === 201 && r.json.googleWallet === 'error' && r.json.tarjeta.puntos === 6,
    `(${r.status}, gw=${r.json?.googleWallet}, p=${r.json?.tarjeta?.puntos})`
  );
  global.__GW_SYNC_FALLO = false;

  // El usuario todavía no ha guardado la tarjeta -> 404 de Google
  global.__GW_SYNC_SIN_OBJETO = true;
  r = await movGw(idWallet, { puntosDelta: 1, premiosDelta: 0, idempotencia: 'gw-003' });
  check(
    'objeto aún no guardado por el usuario -> googleWallet "sin_objeto"',
    r.status === 201 && r.json.googleWallet === 'sin_objeto',
    `(${r.status}, gw=${r.json?.googleWallet})`
  );
  global.__GW_SYNC_SIN_OBJETO = false;

  // Reintento idempotente: también intenta resincronizar (auto-sanación)
  r = await movGw(idWallet, { puntosDelta: 3, premiosDelta: 0, idempotencia: 'gw-001' });
  check(
    'reintento duplicado -> 200 con googleWallet (reintento de sync)',
    r.status === 200 && r.json.duplicado === true && r.json.googleWallet === 'sincronizado',
    `(${r.status}, gw=${r.json?.googleWallet})`
  );

  // ---------------- resumen ----------------
  const fallos = resultados.filter((x) => !x.ok);
  console.log(`\n${resultados.length - fallos.length}/${resultados.length} comprobaciones OK`);
  server.close();
  process.exit(fallos.length ? 1 : 0);
}

main().catch((err) => {
  console.error('ERROR en el smoke test:', err);
  process.exit(1);
});
