#!/usr/bin/env node
/**
 * Create or update the protected Super Admin Owner account in Firebase
 * Authentication and grant it the SUPER_ADMIN_OWNER custom claim.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *   SUPER_ADMIN_EMAIL=owner@example.com \
 *   node scripts/provisionOwner.js
 *
 * The password is read from SUPER_ADMIN_PASSWORD or, if that is unset and a
 * terminal is attached, from a hidden prompt. It is sent only to Firebase
 * Authentication (which stores it hashed). It is never printed, logged,
 * written to disk or stored in Firestore. Omit it to keep an existing
 * account's password unchanged and only (re)apply the owner claim.
 *
 * This is the only way the SUPER_ADMIN_OWNER role is granted. Running it
 * requires Firebase Admin credentials for the project.
 */
require('dotenv').config();
const readline = require('readline');
const { OWNER_ROLE, getOwnerEmail } = require('../backend/src/config/owner');

const MIN_PASSWORD_LENGTH = 12;

function promptHidden(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = () => {}; // do not echo what is typed
    process.stdout.write(question);
    rl.question('', answer => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main() {
  const admin = require('firebase-admin');
  let projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    try { projectId = require('../firebase-applet-config.json').projectId; } catch (_) {}
  }
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId });
  const auth = admin.auth();
  const email = getOwnerEmail();

  let password = process.env.SUPER_ADMIN_PASSWORD || '';
  const existing = await auth.getUserByEmail(email).catch(err => {
    if (err.code === 'auth/user-not-found') return null;
    throw err;
  });

  if (!password && !existing && process.stdin.isTTY) {
    password = await promptHidden(`Password for new owner account ${email} (input hidden): `);
  }
  if (password && password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`The owner password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  let user;
  if (existing) {
    user = password ? await auth.updateUser(existing.uid, { password, disabled: false }) : existing;
    console.log(`Owner account found (uid ${user.uid}).${password ? ' Password updated in Firebase Authentication.' : ''}`);
  } else {
    if (!password) {
      throw new Error('No owner account exists yet. Provide SUPER_ADMIN_PASSWORD or run in a terminal to be prompted.');
    }
    user = await auth.createUser({ email, password, emailVerified: false, disabled: false });
    console.log(`Owner account created (uid ${user.uid}).`);
  }
  password = null;

  // Only one account may hold the owner claim: remove it from anyone else.
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const u of page.users) {
      if (u.uid !== user.uid && u.customClaims && u.customClaims.role === OWNER_ROLE) {
        const { role, owner, ...rest } = u.customClaims;
        await auth.setCustomUserClaims(u.uid, rest);
        await auth.revokeRefreshTokens(u.uid);
        console.log(`Removed a stray owner claim from uid ${u.uid}.`);
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);

  await auth.setCustomUserClaims(user.uid, { ...(user.customClaims || {}), role: OWNER_ROLE, owner: true });
  console.log(`Granted ${OWNER_ROLE} to ${email}. Sign out and back in for it to take effect.`);
  console.log('If SUPER_ADMIN_PASSWORD was set in your shell or a secrets file, remove it now.');
}

main().catch(err => {
  // Error messages from the Admin SDK never include the password.
  console.error(`Owner provisioning failed: ${err.message}`);
  process.exit(1);
});
