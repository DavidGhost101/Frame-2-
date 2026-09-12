const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const config = require('./config');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const requestSanitizer = require('./middleware/requestSanitizer');
const { apiLimiter } = require('./middleware/rateLimiters');
const HealthController = require('./controllers/HealthController');

const app = express();
app.set('trust proxy', 1);

// Security Headers
app.use(
  helmet({
    contentSecurityPolicy: false, // Turnstile, Google Maps, CDN assets & Tailwind styles
    crossOriginEmbedderPolicy: false,
    frameguard: false // Needed for AI Studio preview iframe
  })
);

// Security Headers: content-type-options, referrer-policy, permissions-policy
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(self)');
  next();
});

// CORS: allow all incoming origins, preview domains, iframe contexts, and local origins
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow all origins (reflects incoming origin header to support credentials)
      callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key', 'X-Requested-With', 'Accept', 'Origin']
  })
);
app.options('*', cors());

// Body parsers (50mb to gracefully accommodate room photo uploads and base64 images)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());

// Input sanitizer & NoSQL defense
app.use(requestSanitizer);

// Response-level security interceptor: deeply sanitize all JSON responses
const { sanitizeData } = require('./utils/securitySanitizer');
app.use((req, res, next) => {
  const originalJson = res.json;
  res.json = function (body) {
    if (body && typeof body === 'object') {
      body = sanitizeData(body);
    }
    return originalJson.call(this, body);
  };
  next();
});

// General rate limiter on /api
app.use('/api', apiLimiter);

// Top-level /health check endpoint as specified in system requirements
app.get('/health', (req, res) => HealthController.getHealth(req, res));
app.get('/api/health', (req, res) => HealthController.getHealth(req, res));

// Public config: lets frontend check Turnstile key and devMode safely
app.get('/api/config', (req, res) => {
  const rawKey = config.security.turnstileSiteKey ? config.security.turnstileSiteKey.trim() : null;
  const isValidTurnstileKey =
    rawKey &&
    rawKey !== 'replace_with_turnstile_site_key' &&
    rawKey !== 'replace_with_a_long_random_admin_key' &&
    /^[0-9a-zA-Z_-]{10,}$/.test(rawKey) &&
    (rawKey.startsWith('0x') || rawKey.startsWith('1x') || rawKey.startsWith('2x') || rawKey.startsWith('3x'));

  res.json({
    turnstileSiteKey: isValidTurnstileKey ? rawKey : null,
    devMode: config.env === 'development' || config.sms.driver === 'local'
  });
});

// Master API Routes
app.use('/api', routes);

// Static frontend serving
const publicDir = path.resolve(__dirname, '../../public');
app.use(express.static(publicDir));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});

// Catch-all for single-page app navigation
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Centralized error handling
app.use(errorHandler);

module.exports = app;
