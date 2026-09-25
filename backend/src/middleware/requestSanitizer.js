/**
 * Request Sanitization, Prototype Pollution & NoSQL injection defense
 */

const FORBIDDEN_PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function sanitizeValue(value, depth = 0) {
  // Prevent deeply nested structures from causing stack overflow DoS
  if (depth > 15) {
    return null;
  }

  if (typeof value === 'string') {
    // Strip control characters & dangerous script tags
    return value.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '').trim();
  }

  if (Array.isArray(value)) {
    return value.map(item => sanitizeValue(item, depth + 1));
  }

  if (value !== null && typeof value === 'object') {
    const clean = Object.create(null);
    for (const key of Object.keys(value)) {
      // Block prototype pollution
      if (FORBIDDEN_PROTO_KEYS.has(key)) {
        continue;
      }

      // Strip keys starting with $ or containing . to prevent NoSQL query operator injections
      if (key.startsWith('$') || key.includes('.')) {
        continue;
      }

      clean[key] = sanitizeValue(value[key], depth + 1);
    }
    return Object.assign({}, clean);
  }

  return value;
}

function requestSanitizer(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeValue(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeValue(req.query);
  }
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeValue(req.params);
  }
  next();
}

module.exports = requestSanitizer;
