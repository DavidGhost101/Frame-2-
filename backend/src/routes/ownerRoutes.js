/**
 * Protected Super Admin Owner endpoints (mounted at /api/admin/owner).
 *
 * The browser signs the owner in with Firebase Authentication and sends only
 * the resulting ID token here. No password ever reaches this server.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const TokenUtil = require('../utils/tokenUtil');
const ApiResponse = require('../utils/apiResponse');
const firebaseAdmin = require('../services/FirebaseAdminService');
const ownerService = require('../services/OwnerService');
const { authLimiter } = require('../middleware/rateLimiters');
const { getOwnerEmail } = require('../config/owner');

const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 2 * 60 * 60 * 1000
};

function readSessionToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7);
  return (req.cookies && req.cookies.adminSession) || null;
}

function requireOwnerSession(req, res, next) {
  const token = readSessionToken(req);
  const decoded = token ? TokenUtil.verifyAccessToken(token) : null;
  if (!ownerService.isOwnerSession(decoded)) {
    return ApiResponse.error(res, 'Owner authentication required.', 401);
  }
  req.user = decoded;
  req.sessionToken = token;
  next();
}

// Exchange a Firebase ID token for an owner session.
router.post('/session', authLimiter, async (req, res) => {
  const idToken = req.body && typeof req.body.idToken === 'string' ? req.body.idToken : null;
  if (!idToken) {
    return ApiResponse.error(res, 'A Firebase ID token is required.', 400);
  }

  let decoded;
  try {
    decoded = await firebaseAdmin.verifyIdToken(idToken);
  } catch (err) {
    const unavailable = err && err.statusCode === 503;
    await ownerService.audit('OWNER_AUTH_FAILURE', {
      req,
      status: 'FAILURE',
      failureReason: unavailable ? 'FIREBASE_ADMIN_UNAVAILABLE' : 'INVALID_OR_REVOKED_ID_TOKEN'
    });
    return unavailable
      ? ApiResponse.error(res, 'Owner sign-in is not configured on this server.', 503)
      : ApiResponse.error(res, 'Sign-in could not be verified. Please sign in again.', 401);
  }

  if (!ownerService.isOwnerClaims(decoded)) {
    await ownerService.audit('OWNER_ROLE_VERIFICATION_FAILED', {
      req,
      actor: { uid: decoded.uid, email: decoded.email, role: decoded.role || 'USER' },
      status: 'FAILURE',
      failureReason: 'NOT_OWNER'
    });
    return ApiResponse.error(res, 'This account is not the application owner.', 403);
  }

  const owner = ownerService.ensureOwnerRecord({ uid: decoded.uid, email: decoded.email });
  const sessionUser = {
    uid: decoded.uid,
    userId: String(owner._id),
    email: owner.email,
    role: ownerService.OWNER_ROLE,
    admin: true,
    owner: true,
    authProvider: 'firebase',
    fullName: owner.fullName
  };
  const accessToken = TokenUtil.generateAccessToken(sessionUser);

  await ownerService.audit('OWNER_ROLE_VERIFIED', { req, actor: sessionUser });
  await ownerService.audit('OWNER_LOGIN', { req, actor: sessionUser });

  res.cookie('adminSession', accessToken, SESSION_COOKIE_OPTIONS);
  const safeUser = { role: sessionUser.role, admin: true, owner: true, fullName: sessionUser.fullName, email: sessionUser.email };
  return ApiResponse.success(res, 'Owner authentication successful.', {
    authenticated: true,
    accessToken,
    token: accessToken,
    user: safeUser
  }, 200, { authenticated: true, token: accessToken, user: safeUser });
});

router.get('/session', requireOwnerSession, (req, res) => {
  return ApiResponse.success(res, 'Owner session valid.', {
    authenticated: true,
    user: { role: req.user.role, admin: true, owner: true, fullName: req.user.fullName, email: req.user.email }
  });
});

router.post('/logout', requireOwnerSession, async (req, res) => {
  TokenUtil.revokeToken(req.sessionToken);
  res.clearCookie('adminSession', { httpOnly: true, secure: SESSION_COOKIE_OPTIONS.secure, sameSite: 'strict' });
  await ownerService.audit('OWNER_LOGOUT', { req, actor: req.user });
  return ApiResponse.success(res, 'Signed out.', null);
});

// Sign the owner out everywhere: revokes Firebase refresh tokens on every
// device and invalidates every owner session this server has issued.
router.post('/revoke-sessions', requireOwnerSession, async (req, res) => {
  try {
    await firebaseAdmin.revokeRefreshTokens(req.user.uid);
  } catch (err) {
    await ownerService.audit('OWNER_SESSIONS_REVOKE_FAILED', { req, actor: req.user, status: 'FAILURE', failureReason: 'FIREBASE_ERROR' });
    return ApiResponse.error(res, 'Could not revoke sessions right now. Please try again.', 503);
  }
  ownerService.revokeOwnerSessions();
  res.clearCookie('adminSession', { httpOnly: true, secure: SESSION_COOKIE_OPTIONS.secure, sameSite: 'strict' });
  await ownerService.audit('OWNER_SESSIONS_REVOKED', { req, actor: req.user });
  return ApiResponse.success(res, 'All owner sessions were signed out. Sign in again to continue.', null);
});

// Send Firebase's password-reset email to the configured owner address.
// The address is fixed server-side, so this cannot be used to email anyone
// else, and the response is the same whatever happens.
router.post('/password-reset', authLimiter, async (req, res) => {
  let apiKey = null;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));
    apiKey = cfg.apiKey || null;
  } catch (_) {}

  let delivered = false;
  if (apiKey) {
    try {
      const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestType: 'PASSWORD_RESET', email: getOwnerEmail() })
      });
      delivered = r.ok;
    } catch (_) {}
  }

  await ownerService.audit('OWNER_PASSWORD_RESET_REQUESTED', {
    req,
    status: delivered ? 'SUCCESS' : 'FAILURE',
    failureReason: delivered ? null : 'RESET_EMAIL_NOT_SENT'
  });
  return ApiResponse.success(res, 'If the owner account exists, a password reset email has been sent to the owner address.', null);
});

module.exports = router;
