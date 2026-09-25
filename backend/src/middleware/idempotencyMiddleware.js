const crypto = require('crypto');
const ApiResponse = require('../utils/apiResponse');

/**
 * In-Memory Idempotency & Rapid Double-Submission Store
 * TTL: 10 minutes for explicit idempotency keys, 5 seconds for rapid duplicate submissions.
 */
class IdempotencyStore {
  constructor() {
    this.records = new Map();
    this.inFlight = new Set();
    this.fingerprints = new Map();

    // Periodic sweep every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    if (this.cleanupInterval.unref) this.cleanupInterval.unref();
  }

  cleanup() {
    const now = Date.now();
    for (const [key, item] of this.records.entries()) {
      if (item.expiresAt < now) {
        this.records.delete(key);
      }
    }
    for (const [hash, item] of this.fingerprints.entries()) {
      if (item.expiresAt < now) {
        this.fingerprints.delete(hash);
      }
    }
  }

  get(key) {
    const item = this.records.get(key);
    if (!item) return null;
    if (item.expiresAt < Date.now()) {
      this.records.delete(key);
      return null;
    }
    return item;
  }

  set(key, statusCode, body, ttlMs = 10 * 60 * 1000) {
    this.records.set(key, {
      statusCode,
      body,
      expiresAt: Date.now() + ttlMs
    });
    this.inFlight.delete(key);
  }

  markInFlight(key) {
    this.inFlight.add(key);
  }

  isInFlight(key) {
    return this.inFlight.has(key);
  }

  clearInFlight(key) {
    this.inFlight.delete(key);
  }

  // Duplicate submission fingerprinting
  checkDuplicateFingerprint(hash) {
    const item = this.fingerprints.get(hash);
    if (!item) return null;
    if (item.expiresAt < Date.now()) {
      this.fingerprints.delete(hash);
      return null;
    }
    return item;
  }

  recordFingerprint(hash, statusCode, body, windowMs = 5000) {
    this.fingerprints.set(hash, {
      statusCode,
      body,
      expiresAt: Date.now() + windowMs
    });
  }
}

const store = new IdempotencyStore();

/**
 * Idempotency & Duplicate Request Protection Middleware
 */
function idempotencyProtection(options = {}) {
  const { duplicateWindowMs = 5000, keyTtlMs = 10 * 60 * 1000 } = options;

  return (req, res, next) => {
    // Only apply to state-changing methods
    if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
      return next();
    }

    const clientKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];

    // 1. Explicit Idempotency Key Handling
    if (clientKey && typeof clientKey === 'string' && clientKey.trim()) {
      const sanitizedKey = clientKey.trim().slice(0, 128);

      if (store.isInFlight(sanitizedKey)) {
        return ApiResponse.error(
          res,
          'A request with this idempotency key is currently processing. Please wait.',
          409,
          [],
          'CONFLICT'
        );
      }

      const cached = store.get(sanitizedKey);
      if (cached) {
        res.setHeader('X-Idempotency-Hit', 'true');
        return res.status(cached.statusCode).json(cached.body);
      }

      store.markInFlight(sanitizedKey);

      // Intercept res.json to capture response
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        store.set(sanitizedKey, res.statusCode, body, keyTtlMs);
        return originalJson(body);
      };

      res.on('finish', () => {
        if (store.isInFlight(sanitizedKey)) {
          store.clearInFlight(sanitizedKey);
        }
      });

      return next();
    }

    // 2. Automatic Rapid Double-Click Protection
    // Create payload fingerprint based on actor/IP + URL + critical body fields
    try {
      const ip = req.ip || (req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : '127.0.0.1');
      const userId = req.user ? (req.user._id || req.user.id || req.user.userId || '') : '';
      const bodyDigest = crypto.createHash('sha256').update(JSON.stringify(req.body || {})).digest('hex').slice(0, 16);
      const fingerprint = `${req.method}:${req.baseUrl || ''}${req.path}:${ip}:${userId}:${bodyDigest}`;

      const duplicate = store.checkDuplicateFingerprint(fingerprint);
      if (duplicate && res.statusCode < 400) {
        res.setHeader('X-Duplicate-Deduplicated', 'true');
        return res.status(duplicate.statusCode).json(duplicate.body);
      }

      // Intercept successful completion to prevent subsequent identical clicks
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          store.recordFingerprint(fingerprint, res.statusCode, body, duplicateWindowMs);
        }
        return originalJson(body);
      };
    } catch (_) {}

    next();
  };
}

module.exports = {
  idempotencyProtection,
  idempotencyStore: store
};
