const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

function sanitizeTimespan(val, fallback) {
  if (typeof val === 'number' && val > 0) return val;
  if (typeof val === 'string' && /^\d+[smhdwy]$/i.test(val.trim())) return val.trim();
  return fallback;
}

// Generate ephemeral random keys for startup fallback if environment variables are not provided
const runtimeEphemeralJwtSecret = crypto.randomBytes(32).toString('hex');
const runtimeEphemeralRefreshSecret = crypto.randomBytes(32).toString('hex');
const runtimeEphemeralAdminKey = crypto.randomBytes(16).toString('hex');

function sanitizeSecret(val, fallback) {
  if (typeof val === 'string' && val.trim().length >= 8 && !val.includes('replace_with_') && !val.includes('dev_super_secret')) {
    return val.trim();
  }
  return fallback;
}

function sanitizeAdminSecret(val) {
  if (typeof val === 'string' && val.trim().length >= 6 && !val.includes('replace_with_') && !val.includes('dev_super_secret')) {
    return val.trim();
  }
  return null;
}

const configuredAdminKey = sanitizeAdminSecret(process.env.ADMIN_KEY) || sanitizeAdminSecret(process.env.ADMIN_PASSWORD);

if (!configuredAdminKey && process.env.NODE_ENV !== 'production') {
  console.log('[Admin Security] Notice: Ephemeral session active.');
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  host: process.env.HOST || '0.0.0.0',
  
  jwt: {
    secret: sanitizeSecret(process.env.JWT_SECRET, runtimeEphemeralJwtSecret),
    accessExpiresIn: sanitizeTimespan(process.env.JWT_EXPIRES_IN, '2h'),
    refreshExpiresIn: sanitizeTimespan(process.env.JWT_REFRESH_EXPIRES_IN, '7d'),
    refreshSecret: sanitizeSecret(process.env.JWT_REFRESH_SECRET, runtimeEphemeralRefreshSecret)
  },
  
  admin: {
    key: configuredAdminKey || runtimeEphemeralAdminKey,
    configuredKey: configuredAdminKey,
    email: process.env.ADMIN_EMAIL || 'admin@rentaroomsoweto.co.za',
    username: process.env.ADMIN_USERNAME || 'admin'
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
