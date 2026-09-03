const Logger = require('../../utils/logger');

class WhatsappProvider {
  async sendWhatsapp(toPhone, message) {
    Logger.info(`[WhatsApp Notification Dispatch] To: ${toPhone}`);
    return {
      success: true,
      provider: 'whatsapp_gateway',
      message: 'WhatsApp notification sent or queued'
    };
  }
}

module.exports = new WhatsappProvider();
