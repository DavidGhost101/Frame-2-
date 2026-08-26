const mockDriver = require('./mockSmsDriver');
const twilioDriver = require('./twilioDriver');

function isLocalDriver() {
  return process.env.SMS_DRIVER === 'local' || process.env.NODE_ENV === 'development';
}

// Resolved lazily (not at require-time) so tests can toggle env vars per-run.
module.exports = {
  isLocalDriver,
  sendSMSOTP: (...args) => (isLocalDriver() ? mockDriver : twilioDriver).sendSMSOTP(...args),
  verifySMSOTP: (...args) => (isLocalDriver() ? mockDriver : twilioDriver).verifySMSOTP(...args)
};
