const RefreshToken = require('../models/RefreshToken');
const Logger = require('../utils/logger');

class BackgroundJobRunner {
  static start() {
    // Run every 12 hours: Clean expired or revoked refresh tokens
    setInterval(async () => {
      try {
        const result = await RefreshToken.deleteMany({
          $or: [
            { expiresAt: { $lt: new Date() } },
            { isRevoked: true, updatedAt: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }
          ]
        });
        if (result.deletedCount > 0) {
          Logger.info(`Cleaned up ${result.deletedCount} expired refresh tokens.`);
        }
      } catch (err) {
        Logger.warn('Background cleanup job notice:', { error: err.message });
      }
    }, 12 * 60 * 60 * 1000);

    Logger.info('Background job runner active.');
  }
}

module.exports = BackgroundJobRunner;
