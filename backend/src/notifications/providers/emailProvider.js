const Logger = require('../../utils/logger');
const config = require('../../config');

class EmailProvider {
  async sendEmail(toEmail, subject, text, html = null) {
    Logger.info(`[Email Notification Dispatch] To: ${toEmail} | Subject: ${subject}`);
    return {
      success: true,
      provider: 'smtp_gateway',
      message: 'Email dispatched or queued'
    };
  }
}

module.exports = new EmailProvider();
