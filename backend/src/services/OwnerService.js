/**
 * Protected Super Admin Owner: identity checks, account protection and
 * owner audit events.
 *
 * Privilege is granted only when all of these hold for a Firebase ID token
 * verified server-side: the token is valid and not revoked, it carries the
 * custom claim role === 'SUPER_ADMIN_OWNER' (set only by
 * scripts/provisionOwner.js through the Firebase Admin SDK), and its email
 * matches the configured owner email. The email alone never grants anything.
 */
const fallbackStore = require('../../../services/fallbackStore');
const auditLogRepository = require('../repositories/AuditLogRepository');
const {
  OWNER_ROLE,
  PROTECTED_OWNER_MESSAGE,
  PROTECTED_OWNER_CODE,
  normalizeEmail,
  getOwnerEmail
} = require('../config/owner');

// Owner sessions issued before this moment are rejected (set by "revoke all
// sessions"). Held in memory; owner session tokens are short-lived anyway.
let ownerSessionsValidAfterMs = 0;

function isOwnerClaims(decoded) {
  return Boolean(
    decoded &&
    decoded.role === OWNER_ROLE &&
    decoded.email &&
    normalizeEmail(decoded.email) === getOwnerEmail()
  );
}

/**
 * True when a server-issued session token represents the verified owner.
 * Only sessions minted by the Firebase owner login carry authProvider
 * 'firebase' and a uid; a token that merely says role SUPER_ADMIN_OWNER is
 * not enough.
 */
function isOwnerSession(sessionPayload) {
  if (!sessionPayload || sessionPayload.role !== OWNER_ROLE) return false;
  if (sessionPayload.authProvider !== 'firebase' || !sessionPayload.uid) return false;
  if (normalizeEmail(sessionPayload.email) !== getOwnerEmail()) return false;
  const issuedAtMs = (sessionPayload.iat || 0) * 1000;
  return issuedAtMs >= ownerSessionsValidAfterMs;
}

function revokeOwnerSessions() {
  // Tokens carry second-resolution iat: reject everything issued up to now.
  ownerSessionsValidAfterMs = (Math.floor(Date.now() / 1000) + 1) * 1000;
}

/** True when a stored user or landlord record belongs to the owner. */
function isProtectedOwnerRecord(record) {
  if (!record) return false;
  const emails = [record.email, ...(Array.isArray(record.emails) ? record.emails : [])].map(normalizeEmail);
  return (
    record.role === OWNER_ROLE ||
    record.isOwner === true ||
    emails.includes(getOwnerEmail())
  );
}

/** Upsert the owner's user record (no password field, ever). */
function ensureOwnerRecord({ uid, email }) {
  const users = fallbackStore.fallbackUsers;
  let owner = users.find(u => u.firebaseUid === uid) ||
    users.find(u => normalizeEmail(u.email) === normalizeEmail(email));
  if (!owner) {
    owner = { _id: `owner_${uid}`, createdAt: new Date() };
    users.push(owner);
  }
  Object.assign(owner, {
    fullName: owner.fullName || 'Owner',
    email: normalizeEmail(email),
    firebaseUid: uid,
    role: OWNER_ROLE,
    isOwner: true,
    status: 'active',
    isBlocked: false,
    updatedAt: new Date()
  });
  delete owner.password;
  delete owner.passwordHash;
  try { fallbackStore.saveStore(); } catch (_) {}
  return owner;
}

function actorFields(actor) {
  return {
    actorId: actor && (actor.uid || actor.userId || actor._id) ? String(actor.uid || actor.userId || actor._id) : null,
    actorEmail: (actor && actor.email) || null,
    actorRole: (actor && actor.role) || 'ANONYMOUS'
  };
}

async function audit(action, { actor = null, status = 'SUCCESS', failureReason = null, details = {}, req = null } = {}) {
  try {
    await auditLogRepository.logAction({
      ...actorFields(actor),
      action,
      category: 'SECURITY',
      resource: 'OwnerAccount',
      entityType: 'OwnerAccount',
      status,
      failureReason,
      ipAddress: req ? (req.ip || null) : null,
      userAgent: req && req.headers ? (req.headers['user-agent'] || null) : null,
      details
    });
  } catch (_) {}
}

function protectedOwnerError() {
  const err = new Error(PROTECTED_OWNER_MESSAGE);
  err.statusCode = 403;
  err.status = 403;
  err.code = PROTECTED_OWNER_CODE;
  return err;
}

/**
 * Throw 403 if `target` is the owner. Every attempt is written to the audit
 * log, whoever makes it (the owner included: owner changes are made only
 * through scripts/provisionOwner.js and Firebase, never the admin UI).
 */
async function assertNotOwner(target, attemptedAction, actor) {
  if (!isProtectedOwnerRecord(target)) return;
  await audit('OWNER_PROTECTION_BLOCKED', {
    actor,
    status: 'FAILURE',
    failureReason: PROTECTED_OWNER_CODE,
    details: { attemptedAction, targetId: target && target._id ? String(target._id) : null }
  });
  throw protectedOwnerError();
}

/** Nobody may grant the owner role through the application. */
async function assertRoleAssignable(role, targetId, actor) {
  if (role !== OWNER_ROLE) return;
  await audit('OWNER_PROTECTION_BLOCKED', {
    actor,
    status: 'FAILURE',
    failureReason: 'OWNER_ROLE_NOT_ASSIGNABLE',
    details: { attemptedAction: 'ASSIGN_OWNER_ROLE', targetId: targetId ? String(targetId) : null }
  });
  throw protectedOwnerError();
}

module.exports = {
  OWNER_ROLE,
  isOwnerClaims,
  isOwnerSession,
  revokeOwnerSessions,
  isProtectedOwnerRecord,
  ensureOwnerRecord,
  assertNotOwner,
  assertRoleAssignable,
  audit
};
