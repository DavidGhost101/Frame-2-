/**
 * Protected Super Admin Owner configuration.
 *
 * The owner's identity is an email address plus a Firebase Authentication
 * account that carries the custom claim { role: 'SUPER_ADMIN_OWNER' }. The
 * owner's password lives only in Firebase Authentication. It is never read,
 * stored, logged or returned by this server.
 *
 * SUPER_ADMIN_EMAIL overrides the default owner email. The email is not a
 * secret; the password is, and it is only ever supplied to
 * scripts/provisionOwner.js through the SUPER_ADMIN_PASSWORD environment
 * variable at provisioning time.
 */
const OWNER_ROLE = 'SUPER_ADMIN_OWNER';
const DEFAULT_OWNER_EMAIL = '12rakosadavid@gmail.com';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function getOwnerEmail() {
  return normalizeEmail(process.env.SUPER_ADMIN_EMAIL || DEFAULT_OWNER_EMAIL);
}

module.exports = {
  OWNER_ROLE,
  PROTECTED_OWNER_MESSAGE: 'Protected Super Admin Owner account.',
  PROTECTED_OWNER_CODE: 'PROTECTED_OWNER_ACCOUNT',
  normalizeEmail,
  getOwnerEmail
};
