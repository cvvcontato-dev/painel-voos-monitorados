const bcrypt = require('bcryptjs');
const ROUNDS = 12;

async function hash(plain) {
  return bcrypt.hash(plain, ROUNDS);
}

async function compare(plain, stored) {
  return bcrypt.compare(plain, stored);
}

module.exports = { hash, compare };
