const path = require('path');
require('dotenv').config();

function sanitizeTimespan(val, fallback) {
  if (typeof val === 'number' && val > 0) return val;
  if (typeof val === 'string' && /^\d+[smhdwy]$/i.test(val.trim())) return val.trim();
  return fallback;
}

function sanitizeSecret(val, fallback) {
  if (typeof val === 'string' && val.trim().length >= 8 && !val.includes('replace_with_')) {
    return val.trim();
  }
  return fallback;
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  host: process.env.HOST || '0.0.0.0',
  
  jwt: {
    secret: sanitizeSecret(process.env.JWT_SECRET, 'dev_super_secret_jwt_key_rent_a_room_2026'),
    accessExpiresIn: sanitizeTimespan(process.env.JWT_EXPIRES_IN, '2h'),
    refreshExpiresIn: sanitizeTimespan(process.env.JWT_REFRESH_EXPIRES_IN, '7d'),
    refreshSecret: sanitizeSecret(process.env.JWT_REFRESH_SECRET, 'dev_refresh_secret_key_rent_a_room_2026')
  },
  
  admin: {
    key: process.env.ADMIN_KEY || 'Kgutlisiii1!'
  },
  
  db: {
    uri: process.env.MONGODB_URI || '',
    connectTimeoutMs: 2500
  },
  
  sms: {
    driver: process.env.SMS_DRIVER || 'local',
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID || '',
      authToken: process.env.TWILIO_AUTH_TOKEN || '',
      fromNumber: process.env.TWILIO_PHONE_NUMBER || ''
    }
  },
  
  email: {
    smtpHost: process.env.SMTP_HOST || '',
    smtpPort: parseInt(process.env.SMTP_PORT, 10) || 587,
    smtpUser: process.env.SMTP_USER || '',
    smtpPass: process.env.SMTP_PASS || '',
    fromAddress: process.env.EMAIL_FROM || 'noreply@rentaroomsoweto.co.za'
  },
  
  whatsapp: {
    apiKey: process.env.WHATSAPP_API_KEY || '',
    fromNumber: process.env.WHATSAPP_PHONE_NUMBER || ''
  },
  
  security: {
    turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY || '',
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || '',
    bcryptSaltRounds: 10,
    rateLimitWindowMs: 15 * 60 * 1000, // 15 mins
    rateLimitMax: 300
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY || ''
  }
};

module.exports = config;
