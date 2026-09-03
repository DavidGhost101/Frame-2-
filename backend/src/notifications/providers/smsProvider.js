const config = require('../../config');
const Logger = require('../../utils/logger');

class SmsProvider {
  constructor() {
    this.driver = config.sms.driver;
    this.twilioClient = null;

    if (this.driver === 'twilio' && config.sms.twilio.accountSid && config.sms.twilio.authToken) {
      try {
        const twilio = require('twilio');
        this.twilioClient = twilio(config.sms.twilio.accountSid, config.sms.twilio.authToken);
      } catch (e) {
        Logger.warn('Twilio initialization failed, using local SMS driver:', e.message);
      }
    }
  }

  async sendSms(toPhone, message) {
    if (this.twilioClient && this.driver === 'twilio') {
      try {
        const result = await this.twilioClient.messages.create({
          body: message,
          from: config.sms.twilio.fromNumber,
          to: toPhone
        });
        Logger.info(`Twilio SMS dispatched to ${toPhone}`, { sid: result.sid });
        return { success: true, sid: result.sid, provider: 'twilio' };
      } catch (err) {
        Logger.error(`Twilio dispatch error for ${toPhone}:`, { error: err.message });
        return { success: false, error: err.message, provider: 'twilio' };
      }
    }

    // Local Development / Test SMS driver: logs safely to console
    console.log(`\n========================================`);
    console.log(`[LOCAL SMS DISPATCH] To: ${toPhone}`);
    console.log(`[MESSAGE CONTENT]: ${message}`);
    console.log(`========================================\n`);

    return {
      success: true,
      sid: `local_${Date.now()}`,
      provider: 'local_simulated',
      message: 'Simulated SMS logged locally'
    };
  }
}

module.exports = new SmsProvider();
