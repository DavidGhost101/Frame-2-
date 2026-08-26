const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const token = req.cookies?.auth_token || req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized. Verification required.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired session token.' });
  }
}

// Accepts EITHER an admin session cookie (set by POST /api/admin/login) OR the
// raw x-admin-key header, so the admin panel can use cookie sessions while
// scripts/automation can still call the API directly with the key.
function requireAdmin(req, res, next) {
  const headerKey = req.headers['x-admin-key'];
  if (process.env.ADMIN_KEY && headerKey === process.env.ADMIN_KEY) {
    return next();
  }

  const token = req.cookies?.admin_token;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.role === 'admin') {
        req.admin = decoded;
        return next();
      }
    } catch (err) {
      // fall through to 403 below
    }
  }

  return res.status(403).json({ error: 'Admin authorization required.' });
}

module.exports = { requireAuth, requireAdmin };
