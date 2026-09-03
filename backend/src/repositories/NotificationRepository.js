const BaseRepository = require('./BaseRepository');
const NotificationLog = require('../models/NotificationLog');

class NotificationRepository extends BaseRepository {
  constructor() {
    super(NotificationLog);
  }

  async logNotification({ channel, recipient, template, message, status, providerResponse, errorMessage }) {
    try {
      const log = new this.model({
        channel,
        recipient,
        template,
        message,
        status,
        providerResponse,
        errorMessage
      });
      return await log.save();
    } catch (err) {
      console.warn('Notification log write notice:', err.message);
      return null;
    }
  }

  async findRecent(limit = 50) {
    return this.model.find().sort({ createdAt: -1 }).limit(limit);
  }
}

module.exports = new NotificationRepository();
