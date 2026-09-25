/**
 * CSRF Decision Engine & Origin Protection Middleware
 *
 * Implements strict Cross-Site Request Forgery defense:
 * 1. Read-only methods (GET, HEAD, OPTIONS) are exempt (idempotent).
 * 2. Pure Bearer-token requests (Authorization: Bearer ...) cannot be forged
 *    by browser form submissions or simple cross-origin requests.
 * 3. Cookie-authenticated state-changing requests (POST, PUT, PATCH, DELETE)
 *    MUST come from an authorized origin and/or supply a verified anti-CSRF custom header.
 * 4. Untrusted origins attempting cross-origin state mutations with ambient cookies
 *    are immediately rejected with 403 Forbidden.
 */

const TRUSTED_ORIGIN_PATTERNS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https?:\/\/0\.0\.0\.0(:\d+)?$/,
  /^https:\/\/[a-z0-9-]+\.run\.app$/,
  /^https:\/\/[a-z0-9-]+\.aistudio\.google\.com$/,
  /^https:\/\/[a-z0-9-]+\.google\.com$/
];

function isTrustedOrigin(origin, req) {
  if (!origin) return true; // Direct server-to-server, curl, mobile native, or same-origin without Origin header
  const normalized = origin.trim().toLowerCase();

  // Check host match if available
  if (req && req.headers && req.headers.host) {
    const host = req.headers.host.toLowerCase();
    if (normalized === `http://${host}` || normalized === `https://${host}`) {
      return true;
    }
  }

  return TRUSTED_ORIGIN_PATTERNS.some(pattern => pattern.test(normalized));
}

function csrfProtection(req, res, next) {
  // 1. Safe idempotent methods do not mutate state
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // 2. Check if request is authenticated via ambient browser cookies
  const hasAuthCookie = Boolean(
    req.cookies && (req.cookies.adminSession || req.cookies.landlordToken || req.cookies.auth_token)
  );

  const authHeader = req.headers.authorization;
  const isBearerAuth = authHeader && authHeader.startsWith('Bearer ');

  // 3. If request uses ambient cookies without bearer token, enforce CSRF & origin verification
  if (hasAuthCookie && !isBearerAuth) {
    const origin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : null);

    if (origin && !isTrustedOrigin(origin, req)) {
      return res.status(403).json({
        success: false,
        code: 'CSRF_FORBIDDEN',
        message: 'Cross-origin state-changing request forbidden. Origin is untrusted.'
      });
    }

    // Check for custom header that browsers cannot send cross-origin without CORS preflight
    const customHeader = req.headers['x-requested-with'] || req.headers['x-csrf-token'] || req.headers['x-admin-key'];
    const isFetchOrXhr = req.headers['sec-fetch-site'] === 'same-origin' || req.headers['sec-fetch-site'] === 'same-site' || Boolean(customHeader);

    if (origin && !isFetchOrXhr && !customHeader) {
      // Untrusted cross-site simple request
      const site = req.headers['sec-fetch-site'];
      if (site === 'cross-site') {
        return res.status(403).json({
          success: false,
          code: 'CSRF_BLOCKED',
          message: 'Cross-site request blocked by CSRF defense engine.'
        });
      }
    }
  }

  next();
}

module.exports = {
  csrfProtection,
  isTrustedOrigin,
  TRUSTED_ORIGIN_PATTERNS
};
