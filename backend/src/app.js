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

// Security Headers (configured to allow Turnstile, external images from Unsplash, and Tailwind styles)
app.use(
  helmet({
    contentSecurityPolicy: false, // Let reverse-proxy / client handle CSP without breaking CDN scripts
    crossOriginEmbedderPolicy: false
  })
);

// CORS
app.use(cors({ origin: true, credentials: true }));

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cookieParser());

// Input sanitizer & NoSQL defense
app.use(requestSanitizer);

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
    rawKey !== 'Kgutlisiii1!' &&
    rawKey !== 'admin123' &&
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
