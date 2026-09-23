// =====================================================================
//  Hash de contraseñas (bcrypt). La password plana NUNCA se guarda.
// =====================================================================
const bcrypt = require('bcryptjs');

const ROUNDS = 10;

async function hashPassword(plain) {
  return bcrypt.hash(String(plain), ROUNDS);
}

async function verifyPassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(String(plain), hash);
}

module.exports = { hashPassword, verifyPassword };
