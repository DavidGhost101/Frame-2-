/**
 * Thin wrapper around the Firebase Admin SDK, used for the owner account.
 *
 * Credentials come from Google Application Default Credentials (for example
 * GOOGLE_APPLICATION_CREDENTIALS pointing at a service-account key file, or
 * the runtime identity on Cloud Run). Nothing here ever handles a password:
 * the owner signs in with Firebase Authentication in the browser and the
 * server only verifies the resulting ID token.
 */
const fs = require('fs');
const path = require('path');

let adminApp = null;
let initError = null;

function readProjectId() {
  if (process.env.FIREBASE_PROJECT_ID) return process.env.FIREBASE_PROJECT_ID;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));
    return cfg.projectId || undefined;
  } catch (_) {
    return undefined;
  }
}

function getApp() {
  if (adminApp) return adminApp;
  if (initError) throw initError;
  try {
    // Loaded lazily so the rest of the server runs without the SDK installed.
    const admin = require('firebase-admin');
    adminApp = admin.apps.length
      ? admin.app()
      : admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: readProjectId() });
    return adminApp;
  } catch (err) {
    initError = new Error(`Firebase Admin is not configured: ${err.message}`);
    initError.statusCode = 503;
    throw initError;
  }
}

module.exports = {
  isAvailable() {
    try { getApp(); return true; } catch (_) { return false; }
  },
  // checkRevoked=true makes revoked sessions fail immediately.
  async verifyIdToken(idToken) {
    return getApp().auth().verifyIdToken(idToken, true);
  },
  async revokeRefreshTokens(uid) {
    return getApp().auth().revokeRefreshTokens(uid);
  }
};
