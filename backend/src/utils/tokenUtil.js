const jwt = require('jsonwebtoken');
const config = require('../config');

class TokenUtil {
  static getValidTimespan(val, fallback) {
    if (typeof val === 'number' && val > 0) return val;
    if (typeof val === 'string' && /^\d+[smhdwy]$/i.test(val.trim())) return val.trim();
    return fallback;
  }

  static generateAccessToken(payload) {
    const secret = config.jwt && config.jwt.secret ? config.jwt.secret : 'dev_super_secret_jwt_key_rent_a_room_2026';
    const expiresIn = this.getValidTimespan(config.jwt && config.jwt.accessExpiresIn, '2h');
    return jwt.sign(payload, secret, { expiresIn });
  }

  static generateRefreshToken(payload) {
    const secret = config.jwt && config.jwt.refreshSecret ? config.jwt.refreshSecret : 'dev_refresh_secret_key_rent_a_room_2026';
    const expiresIn = this.getValidTimespan(config.jwt && config.jwt.refreshExpiresIn, '7d');
    return jwt.sign(payload, secret, { expiresIn });
  }

  static verifyAccessToken(token) {
    try {
      const secret = config.jwt && config.jwt.secret ? config.jwt.secret : 'dev_super_secret_jwt_key_rent_a_room_2026';
      return jwt.verify(token, secret);
    } catch (err) {
      return null;
    }
  }

  static verifyRefreshToken(token) {
    try {
      const secret = config.jwt && config.jwt.refreshSecret ? config.jwt.refreshSecret : 'dev_refresh_secret_key_rent_a_room_2026';
      return jwt.verify(token, secret);
    } catch (err) {
      return null;
    }
  }
}

module.exports = TokenUtil;
