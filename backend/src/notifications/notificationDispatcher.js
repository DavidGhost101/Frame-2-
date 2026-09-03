const smsProvider = require('./providers/smsProvider');
const whatsappProvider = require('./providers/whatsappProvider');
const emailProvider = require('./providers/emailProvider');
const notificationRepository = require('../repositories/NotificationRepository');
const Logger = require('../utils/logger');

class NotificationDispatcher {
  /**
   * Dispatch SMS with audit logging
   */
  static async sendSms(toPhone, message, template = 'GENERAL') {
    try {
      const result = await smsProvider.sendSms(toPhone, message);
      await notificationRepository.logNotification({
        channel: 'SMS',
        recipient: toPhone,
        template,
        message,
        status: result.success ? 'SENT' : 'FAILED',
        providerResponse: result,
        errorMessage: result.error || null
      });
      return result;
    } catch (err) {
      Logger.error(`SMS dispatch failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  /**
   * Dispatch WhatsApp message
   */
  static async sendWhatsapp(toPhone, message, template = 'GENERAL') {
    try {
      const result = await whatsappProvider.sendWhatsapp(toPhone, message);
      await notificationRepository.logNotification({
        channel: 'WHATSAPP',
        recipient: toPhone,
        template,
        message,
        status: result.success ? 'SENT' : 'FAILED',
        providerResponse: result
      });
      return result;
    } catch (err) {
      Logger.error(`WhatsApp dispatch failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  /**
   * Dispatch Email message
   */
  static async sendEmail(toEmail, subject, text, html = null, template = 'GENERAL') {
    try {
      const result = await emailProvider.sendEmail(toEmail, subject, text, html);
      await notificationRepository.logNotification({
        channel: 'EMAIL',
        recipient: toEmail,
        template,
        message: `${subject}: ${text}`,
        status: result.success ? 'SENT' : 'FAILED',
        providerResponse: result
      });
      return result;
    } catch (err) {
      Logger.error(`Email dispatch failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  }
}

module.exports = NotificationDispatcher;
