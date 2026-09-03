/**
 * Request Sanitization & NoSQL injection defense
 */

function sanitizeValue(value) {
  if (typeof value === 'string') {
    // Strip control characters & dangerous script tags
    return value.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '').trim();
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value !== null && typeof value === 'object') {
    const clean = {};
    for (const key of Object.keys(value)) {
      // Strip keys starting with $ or containing . to prevent NoSQL query operator injections
      if (key.startsWith('$') || key.includes('.')) {
        continue;
      }
      clean[key] = sanitizeValue(value[key]);
    }
    return clean;
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
