const jwt = require('jsonwebtoken');
const config = require('../config');

class TokenUtil {
  static getValidTimespan(val, fallback) {
    if (typeof val === 'number' && val > 0) return val;
    if (typeof val === 'string' && /^\d+[smhdwy]$/i.test(val.trim())) return val.trim();
    return fallback;
  }

  static generateAccessToken(payload) {
    const secret = (config.jwt && config.jwt.secret) || process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT Secret is not configured.');
    }
    const expiresIn = this.getValidTimespan(config.jwt && config.jwt.accessExpiresIn, '2h');
    return jwt.sign(payload, secret, { expiresIn });
  }

  static generateRefreshToken(payload) {
    const secret = (config.jwt && config.jwt.refreshSecret) || process.env.JWT_REFRESH_SECRET || (config.jwt && config.jwt.secret);
    if (!secret) {
      throw new Error('JWT Refresh Secret is not configured.');
    }
    const expiresIn = this.getValidTimespan(config.jwt && config.jwt.refreshExpiresIn, '7d');
    return jwt.sign(payload, secret, { expiresIn });
  }

  static verifyAccessToken(token) {
    try {
      const secret = (config.jwt && config.jwt.secret) || process.env.JWT_SECRET;
      if (!secret) return null;
      return jwt.verify(token, secret);
    } catch (err) {
      return null;
    }
  }

  static verifyRefreshToken(token) {
    try {
      const secret = (config.jwt && config.jwt.refreshSecret) || process.env.JWT_REFRESH_SECRET || (config.jwt && config.jwt.secret);
      if (!secret) return null;
      return jwt.verify(token, secret);
    } catch (err) {
      return null;
    }
  }
}

module.exports = TokenUtil;
