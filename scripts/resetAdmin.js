#!/usr/bin/env node
/**
 * Emergency Administrator Password Recovery & Reset Utility
 * 
 * Usage:
 *   node scripts/resetAdmin.js "YourNewSecurePassword123!"
 *   npm run admin:reset -- "YourNewSecurePassword123!"
 */
require('dotenv').config();
const crypto = require('crypto');
const AdminInitService = require('../backend/src/services/AdminInitService');

async function main() {
  let targetPassword = process.argv[2] || process.env.ADMIN_PASSWORD;

  if (!targetPassword) {
    console.error('Error: Please provide a password argument.');
    process.exit(1);
  } else {
    targetPassword = targetPassword.trim();
  }

  if (targetPassword.length < 6) {
    console.error('Error: Password must be at least 6 characters long.');
    process.exit(1);
  }

  try {
    await AdminInitService.resetPassword(targetPassword);
    console.log('----------------------------------------------------');
    console.log('✅ Administrator credentials successfully updated.');
    console.log('----------------------------------------------------');
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to update admin credentials:', err.message);
    process.exit(1);
  }
}

main();
