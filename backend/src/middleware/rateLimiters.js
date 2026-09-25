const rateLimit = require('express-rate-limit');
const ApiResponse = require('../utils/apiResponse');

/**
 * EXPLICIT RATE LIMIT POLICIES
 *
 * Each policy defines:
 * - windowMs: Time window duration
 * - max: Maximum requests permitted per window
 * - message: Production-safe error explanation
 * - identifier: Composite (IP + Authenticated User ID) to prevent false-positive lockouts on shared township Wi-Fi/networks
 */
const RATE_LIMIT_POLICIES = {
  GENERAL_API: {
    name: 'GENERAL_API',
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 2000,
    message: 'Too many requests. Please wait a moment before trying again.'
  },
  PUBLIC_SEARCH: {
    name: 'PUBLIC_SEARCH',
    windowMs: 60 * 1000, // 1 minute
    max: 120,
    message: 'Too many search requests. Please wait a moment before searching again.'
  },
  REQUEST_CREATION: {
    name: 'REQUEST_CREATION',
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 15,
    message: 'Room request submission limit reached. Please wait a moment before submitting again.'
  },
  LISTING_CREATION: {
    name: 'LISTING_CREATION',
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 60,
    message: 'Listing creation rate limit reached. Please wait before adding more rooms.'
  },
  LOGIN: {
    name: 'LOGIN',
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    message: 'Too many login attempts. Please wait a few minutes before trying again.'
  },
  OTP: {
    name: 'OTP',
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 15,
    message: 'Too many verification code requests. Please wait a few moments before trying again.'
  },
  AI_REQUEST: {
    name: 'AI_REQUEST',
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 30,
    message: 'AI Advisor rate limit reached. Please wait a few moments before asking another question.'
  },
  UPLOAD: {
    name: 'UPLOAD',
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 60,
    message: 'Upload rate limit reached. Please wait before uploading more photos.'
  },
  CONTACT_TRACK: {
    name: 'CONTACT_TRACK',
    windowMs: 60 * 1000, // 1 minute
    max: 30,
    message: 'Too many contact requests. Please wait a moment before contacting another landlord.'
  }
};

/**
 * Composite Rate Limiting Identifier
 * Prevents multiple legitimate users behind a single shared NAT/Wi-Fi router from locking each other out.
 */
function getRateLimitKey(req) {
  const user = req.user;
  const userId = user ? (user._id || user.id || user.userId || null) : null;
  const ip = req.ip || (req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : '127.0.0.1');
  return userId ? `user:${userId}:${ip}` : `ip:${ip}`;
}

/**
 * Standardized 429 Response Handler
 * Sets standard Retry-After header and returns uniform RATE_LIMITED JSON
 */
function createRateLimitHandler(policy) {
  return (req, res, next, options) => {
    const retrySec = Math.ceil(policy.windowMs / 1000);
    res.setHeader('Retry-After', String(retrySec));
    return ApiResponse.error(res, policy.message, 429, [], 'RATE_LIMITED');
  };
}

/**
 * Helper factory to instantiate express-rate-limit instances from explicit policies.
 */
function createLimiter(policy, overrides = {}) {
  return rateLimit({
    windowMs: policy.windowMs,
    max: policy.max,
    standardHeaders: true, // draft-6 RateLimit-* headers
    legacyHeaders: false, // X-RateLimit-* headers
    keyGenerator: getRateLimitKey,
    skip: (req) => req.method === 'OPTIONS',
    handler: createRateLimitHandler(policy),
    ...overrides
  });
}

// 1. General API rate limiter
const apiLimiter = createLimiter(RATE_LIMIT_POLICIES.GENERAL_API, {
  skip: (req) => req.method === 'OPTIONS' || (req.path && req.path.startsWith('/admin'))
});

// 2. Public Search Limiter (Listings search, Room requests search)
const searchLimiter = createLimiter(RATE_LIMIT_POLICIES.PUBLIC_SEARCH);

// 3. Room Request Creation Limiter (Seeker requests)
const requestCreationLimiter = createLimiter(RATE_LIMIT_POLICIES.REQUEST_CREATION);

// 4. Listing Creation Limiter
const listingCreateLimiter = createLimiter(RATE_LIMIT_POLICIES.LISTING_CREATION);

// 5. Authentication / Login Limiter
const authLimiter = createLimiter(RATE_LIMIT_POLICIES.LOGIN);

// 6. Dedicated OTP Limiter
const otpLimiter = createLimiter(RATE_LIMIT_POLICIES.OTP);

// 7. AI Advisor Limiter
const aiAdvisorLimiter = createLimiter(RATE_LIMIT_POLICIES.AI_REQUEST);

// 8. Upload Limiter
const uploadLimiter = createLimiter(RATE_LIMIT_POLICIES.UPLOAD);

// 9. Contact / Lead Tracking Limiter
const contactLimiter = createLimiter(RATE_LIMIT_POLICIES.CONTACT_TRACK);

module.exports = {
  RATE_LIMIT_POLICIES,
  getRateLimitKey,
  createLimiter,
  apiLimiter,
  searchLimiter,
  requestCreationLimiter,
  listingCreateLimiter,
  authLimiter,
  otpLimiter,
  aiAdvisorLimiter,
  uploadLimiter,
  contactLimiter
};
