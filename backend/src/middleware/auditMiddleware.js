const auditLogRepository = require('../repositories/AuditLogRepository');

/**
 * Derives a standardized resource name from the request path.
 */
function deriveResource(req) {
  const path = (req.baseUrl + (req.path || '')).toLowerCase();
  if (path.includes('/listings')) return 'Listing';
  if (path.includes('/landlords')) return 'Landlord';
  if (path.includes('/users')) return 'User';
  if (path.includes('/room-requests')) return 'RoomRequest';
  if (path.includes('/stats')) return 'DashboardStats';
  if (path.includes('/audit-logs') || path.includes('/audit-trail')) return 'AuditLog';
  if (path.includes('/login') || path.includes('/verify') || path.includes('/session') || path.includes('/logout')) return 'AdminAuth';
  if (path.includes('/bulk-import')) return 'BulkImport';
  return 'AdminResource';
}

/**
 * Derives a standardized action name from the HTTP method, path, and request body.
 */
function deriveAction(req) {
  const method = req.method.toUpperCase();
  const path = (req.baseUrl + (req.path || '')).toLowerCase();

  if (path.includes('/login')) return 'ADMIN_LOGIN';
  if (path.includes('/verify')) return 'ADMIN_VERIFY_KEY';
  if (path.includes('/session')) return 'ADMIN_CHECK_SESSION';
  if (path.includes('/logout')) return 'ADMIN_LOGOUT';
  if (path.includes('/stats')) return 'ADMIN_VIEW_STATS';
  if (path.includes('/audit-logs') || path.includes('/audit-trail')) return 'ADMIN_VIEW_AUDIT_LOGS';

  // Listings actions
  if (path.includes('/listings/import') || path.includes('/bulk-import')) return 'ADMIN_BULK_IMPORT_LISTINGS';
  if (path.includes('/moderate')) return 'ADMIN_MODERATE_LISTING';
  if (path.includes('/listings')) {
    if (method === 'GET') return req.params && req.params.id ? 'ADMIN_VIEW_LISTING_DETAILS' : 'ADMIN_VIEW_LISTINGS';
    if (method === 'POST') return 'ADMIN_CREATE_LISTING';
    if (method === 'PATCH' || method === 'PUT') return 'ADMIN_UPDATE_LISTING';
    if (method === 'DELETE') return 'ADMIN_DELETE_LISTING';
  }

  // Landlords actions
  if (path.includes('/landlords')) {
    if (path.includes('/paid')) return 'ADMIN_SET_LANDLORD_PAID';
    if (path.includes('/block')) return 'ADMIN_SET_LANDLORD_BLOCKED';
    if (method === 'GET') return 'ADMIN_VIEW_LANDLORDS';
    if (method === 'PATCH' || method === 'PUT') return 'ADMIN_UPDATE_LANDLORD';
    if (method === 'DELETE') return 'ADMIN_DEACTIVATE_LANDLORD';
  }

  // Users actions
  if (path.includes('/users')) {
    if (method === 'GET') return 'ADMIN_VIEW_USERS';
    if (method === 'PATCH' || method === 'PUT') return 'ADMIN_UPDATE_USER';
    if (method === 'DELETE') return 'ADMIN_SUSPEND_USER';
  }

  // Room requests actions
  if (path.includes('/room-requests')) {
    if (path.includes('/status')) return 'ADMIN_UPDATE_ROOM_REQUEST_STATUS';
    if (method === 'GET') return 'ADMIN_VIEW_ROOM_REQUESTS';
    if (method === 'PATCH' || method === 'PUT') return 'ADMIN_UPDATE_ROOM_REQUEST';
    if (method === 'DELETE') return 'ADMIN_DELETE_ROOM_REQUEST';
  }

  // Generic fallback
  const resource = deriveResource(req).toUpperCase();
  return `ADMIN_${method}_${resource}`;
}

/**
 * Sanitizes request payload to prevent logging sensitive secrets or full passwords.
 */
function sanitizePayload(body) {
  if (!body || typeof body !== 'object') return {};
  const sanitized = { ...body };
  const sensitiveKeys = ['password', 'adminKey', 'key', 'token', 'secret', 'refreshToken', 'accessToken'];

  for (const k of Object.keys(sanitized)) {
    if (sensitiveKeys.some(sk => k.toLowerCase().includes(sk.toLowerCase()))) {
      sanitized[k] = '***REDACTED***';
    } else if (typeof sanitized[k] === 'object' && sanitized[k] !== null && !Array.isArray(sanitized[k])) {
      sanitized[k] = sanitizePayload(sanitized[k]);
    }
  }
  return sanitized;
}

/**
 * Middleware to log all administrative actions to the AuditLog database collection.
 */
function auditAdminAction(req, res, next) {
  const startTime = Date.now();
  const resource = deriveResource(req);
  const action = deriveAction(req);
  const resourceId = (req.params && req.params.id) || (req.body && (req.body.id || req.body._id)) || (req.query && req.query.id) || null;

  // Intercept the response completion
  res.on('finish', () => {
    try {
      const responseTimeMs = Date.now() - startTime;
      const statusCode = res.statusCode;
      const status = statusCode >= 400 ? 'FAILURE' : statusCode >= 300 ? 'WARNING' : 'SUCCESS';

      const user = req.user || {};
      const userId = user._id || user.id || user.userId || null;
      const userRole = user.role || (user.admin ? 'ADMIN' : 'ANONYMOUS');

      const ipAddress =
        req.ip ||
        (req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : null) ||
        (req.socket ? req.socket.remoteAddress : null);

      const userAgent = req.headers['user-agent'] || null;

      const details = {
        method: req.method,
        path: req.originalUrl || req.url,
        query: req.query && Object.keys(req.query).length ? req.query : undefined,
        body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? sanitizePayload(req.body) : undefined,
        statusCode,
        responseTimeMs,
        adminName: user.fullName || user.name || (userRole === 'ADMIN' ? 'System Administrator' : null)
      };

      // Asynchronously record the audit log
      auditLogRepository
        .logAction({
          userId,
          userRole,
          action,
          resource,
          resourceId,
          ipAddress,
          userAgent,
          details,
          status
        })
        .catch(err => {
          console.warn('Audit logger background write warning:', err.message);
        });
    } catch (err) {
      console.warn('Audit middleware error:', err.message);
    }
  });

  next();
}

module.exports = {
  auditAdminAction,
  deriveAction,
  deriveResource,
  sanitizePayload
};
