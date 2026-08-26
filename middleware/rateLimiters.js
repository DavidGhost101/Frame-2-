const rateLimit = require('express-rate-limit');

// Limits OTP requests per IP to stop SMS-bombing / cost abuse.
const otpIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many OTP requests. Please try again in 15 minutes.' }
});

// Slightly looser limiter for the verify step (user may mistype a few times).
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification attempts. Please try again in 15 minutes.' }
});

module.exports = { otpIpLimiter, otpVerifyLimiter };
