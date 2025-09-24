const bcrypt = require('bcrypt');

const MIN_LENGTH = 8;

function validatePassword(password) {
  if (typeof password !== 'string') return { valid: false, message: 'Password must be a string.' };
  if (password.length < MIN_LENGTH) return { valid: false, message: `Password must be at least ${MIN_LENGTH} characters long.` };
  return { valid: true };
}

function hashPassword(password) {
  return bcrypt.hash(String(password), 10);
}

function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

module.exports = {
  validatePassword,
  hashPassword,
  comparePassword,
  MIN_LENGTH
};
