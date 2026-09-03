const rateLimit = require('express-rate-limit');
const ApiResponse = require('../utils/apiResponse');

// General API rate limiter (300 requests per 15 minutes)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return ApiResponse.error(res, 'Too many requests. Please try again in a few minutes.', 429);
  }
});

// Authentication rate limiter for password/admin endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return ApiResponse.error(res, 'Too many requests. Please wait a few minutes before trying again.', 429);
  }
});

// Dedicated OTP rate limiter (direct phone verification without login)
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return ApiResponse.error(res, 'Too many verification code requests. Please wait a few moments before trying again.', 429);
  }
});

// Listing creation rate limiter (15 requests per 1 hour)
const listingCreateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return ApiResponse.error(res, 'Listing creation rate limit reached. Please wait before adding more rooms.', 429);
  }
});

// AI Advisor limiter (30 queries per 10 minutes)
const aiAdvisorLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return ApiResponse.error(res, 'AI Advisor rate limit reached. Please wait a few moments before asking another question.', 429);
  }
});

module.exports = {
  apiLimiter,
  authLimiter,
  otpLimiter,
  listingCreateLimiter,
  aiAdvisorLimiter
};
