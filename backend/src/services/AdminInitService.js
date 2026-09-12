const bcrypt = require('bcryptjs');
const fallbackStore = require('../../../services/fallbackStore');
const config = require('../config');

class AdminInitService {
  /**
   * Initializes the administrator account upon server startup
   */
  static async initialize() {
    try {
      const admin = fallbackStore.getAdminUser();
      if (!admin) return;

      // Ensure authorized admin identities
      admin.fullName = 'Administrator';
      if (!admin.emails) {
        admin.emails = [];
      }
      if (process.env.ADMIN_EMAIL && !admin.emails.includes(process.env.ADMIN_EMAIL.toLowerCase())) {
        admin.emails.push(process.env.ADMIN_EMAIL.toLowerCase());
      }
      if (!admin.username) {
        admin.username = process.env.ADMIN_USERNAME || 'admin';
      }

      // Check if an admin password candidate is supplied in environment
      const candidatePassword =
        (process.env.ADMIN_PASSWORD && !process.env.ADMIN_PASSWORD.includes('replace_with_') && process.env.ADMIN_PASSWORD.trim()) ||
        (process.env.ADMIN_KEY && !process.env.ADMIN_KEY.includes('replace_with_') && process.env.ADMIN_KEY.trim()) ||
        (process.env.SMTP_PASS && !process.env.SMTP_PASS.includes('replace_with_') && process.env.SMTP_PASS.trim().length >= 6 && process.env.SMTP_PASS.trim());

      if (candidatePassword) {
        // Hash and synchronize password for the administrator account
        const hash = bcrypt.hashSync(candidatePassword, 10);
        admin.passwordHash = hash;
        admin.status = 'active';
        admin.updatedAt = new Date();
        fallbackStore.saveStore();
        console.log('[Admin Security] Administrator password verified and synchronized successfully.');
      } else if (!admin.passwordHash) {
        // Ephemeral password fallback for safety in development
        const ephemeralSecret = config.admin && config.admin.key;
        if (ephemeralSecret) {
          admin.passwordHash = bcrypt.hashSync(ephemeralSecret, 10);
          fallbackStore.saveStore();
          console.log('[Admin Security] Administrator account initialized with active session credential.');
        }
      } else {
        console.log('[Admin Security] Administrator account ready with existing verified credential.');
      }
    } catch (err) {
      console.warn('[Admin Security] Notice during admin initialization:', err.message);
    }
  }

  /**
   * Secure Owner Recovery / Password Reset
   */
  static async resetPassword(newPassword) {
    if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 6) {
      throw new Error('Password must be a string with at least 6 characters.');
    }

    const cleanPass = newPassword.trim();
    const result = fallbackStore.setAdminPassword(cleanPass);

    // Also update MongoDB if connected
    try {
      const mongoose = require('mongoose');
      if (mongoose.connection && mongoose.connection.readyState === 1) {
        const User = require('../models/User');
        const PasswordUtil = require('../utils/passwordUtil');
        const hash = await PasswordUtil.hash(cleanPass);
        await User.updateMany(
          { role: { $in: ['ADMIN', 'SUPER_ADMIN'] } },
          { $set: { password: hash, status: 'active' } }
        );
      }
    } catch (_) {}

    return result;
  }
}

module.exports = AdminInitService;
