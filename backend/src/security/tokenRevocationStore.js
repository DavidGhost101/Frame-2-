/**
 * Token Revocation & Session Invalidation Store
 *
 * Implements strict defense against token replay, session fixation,
 * and maintains revocation lists for logged-out or blocked users.
 */

const crypto = require('crypto');

class TokenRevocationStore {
  constructor() {
    // Map of tokenHash -> expiresAt (timestamp in ms)
    this.revokedTokens = new Map();

    // Clean up expired entries every 15 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 15 * 60 * 1000);

    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  hashToken(token) {
    if (!token || typeof token !== 'string') return null;
    return crypto.createHash('sha256').update(token.trim()).digest('hex');
  }

  /**
   * Revoke a token explicitly until its natural expiration
   * @param {string} token
   * @param {number} expiresInMs - duration in ms to remember revocation, defaults to 7 days
   */
  revoke(token, expiresInMs = 7 * 24 * 60 * 60 * 1000) {
    const hash = this.hashToken(token);
    if (!hash) return;
    const expiresAt = Date.now() + expiresInMs;
    this.revokedTokens.set(hash, expiresAt);
  }

  /**
   * Check if a token has been revoked
   * @param {string} token
   * @returns {boolean}
   */
  isRevoked(token) {
    const hash = this.hashToken(token);
    if (!hash) return false;
    const expiresAt = this.revokedTokens.get(hash);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
      this.revokedTokens.delete(hash);
      return false;
    }
    return true;
  }

  cleanup() {
    const now = Date.now();
    for (const [hash, expiresAt] of this.revokedTokens.entries()) {
      if (now > expiresAt) {
        this.revokedTokens.delete(hash);
      }
    }
  }

  clear() {
    this.revokedTokens.clear();
  }
}

module.exports = new TokenRevocationStore();
