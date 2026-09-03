const notificationRepository = require('../repositories/NotificationRepository');
const notificationDispatcher = require('../notifications/notificationDispatcher');
const ApiResponse = require('../utils/apiResponse');

class NotificationController {
  async getRecentLogs(req, res, next) {
    try {
      const logs = await notificationRepository.findRecent(50);
      return ApiResponse.success(res, 'Notification logs retrieved', logs);
    } catch (err) {
      next(err);
    }
  }

  async sendManualSms(req, res, next) {
    try {
      const { phone, message } = req.body;
      if (!phone || !message) {
        return ApiResponse.error(res, 'Phone and message are required', 400);
      }
      const result = await notificationDispatcher.sendSms(phone, message, 'MANUAL_ADMIN');
      return ApiResponse.success(res, 'SMS dispatched', result);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new NotificationController();
