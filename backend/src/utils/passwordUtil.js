const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const config = require('../config');

class PasswordUtil {
  static async hash(plainPassword) {
    if (!plainPassword || typeof plainPassword !== 'string') {
      throw new Error('Password must be a valid string');
    }
    const salt = await bcrypt.genSalt(config.security.bcryptSaltRounds);
    return bcrypt.hash(plainPassword, salt);
  }

  static async compare(plainPassword, hashedPassword) {
    if (!plainPassword || !hashedPassword) return false;
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  static generateRandomToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  static generateNumericOtp(digits = 6) {
    try {
      const min = Math.pow(10, digits - 1);
      const max = Math.pow(10, digits);
      return crypto.randomInt(min, max).toString();
    } catch {
      const min = Math.pow(10, digits - 1);
      const max = Math.pow(10, digits) - 1;
      return Math.floor(min + Math.random() * (max - min + 1)).toString();
    }
  }
}

module.exports = PasswordUtil;
