const userRepository = require('../repositories/UserRepository');
const TokenUtil = require('../utils/tokenUtil');
const PasswordUtil = require('../utils/passwordUtil');
const NotificationDispatcher = require('../notifications/notificationDispatcher');
const RefreshToken = require('../models/RefreshToken');
const { ROLES } = require('../config/roles');
const config = require('../config');
const fallbackStore = require('../../../services/fallbackStore');
const {
  validateSouthAfricanMobile,
  normalizeSouthAfricanMobile,
  maskPhoneNumber
} = require('../utils/phoneUtils');

// In-memory OTP storage for fast verification (canonicalPhone -> { otp, createdAt, cooldownExpiresAt, expiresAt, attempts, maxAttempts })
const otpStore = new Map();

class AuthService {
  /**
   * Request an OTP for phone number verification with 60-second cooldown protection
   */
  async requestOtp(phone) {
    const val = validateSouthAfricanMobile(phone);
    if (!val.valid) {
      const err = new Error(val.message);
      err.code = val.code;
      err.statusCode = 400;
      throw err;
    }

    const canonicalPhone = val.normalized; // e.g. +27821234567
    const now = Date.now();

    // Check server-side 60-second cooldown
    const existing = otpStore.get(canonicalPhone);
    if (existing && now < existing.cooldownExpiresAt) {
      const retryAfter = Math.max(1, Math.ceil((existing.cooldownExpiresAt - now) / 1000));
      const cooldownErr = new Error(`Please wait ${retryAfter}s before requesting another verification code.`);
      cooldownErr.code = 'OTP_COOLDOWN';
      cooldownErr.statusCode = 429;
      cooldownErr.retryAfter = retryAfter;
      throw cooldownErr;
    }

    // Generate secure random 6-digit OTP
    const otp = PasswordUtil.generateNumericOtp(6);
    const cooldownExpiresAt = now + 60 * 1000; // 60 seconds
    const expiresAt = now + 10 * 60 * 1000; // 10 minutes

    // Store under canonical phone format only (and fallback aliases for backwards compatibility in tests)
    const entry = {
      otp,
      createdAt: now,
      cooldownExpiresAt,
      expiresAt,
      attempts: 0,
      maxAttempts: 5,
      phone: canonicalPhone
    };
    otpStore.set(canonicalPhone, entry);
    if (val.localNormalized) otpStore.set(val.localNormalized, entry);

    const message = `Your Rent A Room Soweto verification code is: ${otp}. Valid for 10 minutes. Do not share this code.`;
    await NotificationDispatcher.sendSms(canonicalPhone, message, 'OTP_VERIFICATION');

    const masked = maskPhoneNumber(canonicalPhone);

    return {
      success: true,
      message: 'Verification code generated successfully. No SMS fee required.',
      phone: canonicalPhone,
      displayPhone: val.formatted,
      maskedPhone: masked,
      cooldownExpiresAt,
      retryAfter: 60,
      ...(process.env.NODE_ENV === 'test' || process.env.SMS_DRIVER === 'local' ? { devOtp: otp } : {})
    };
  }

  /**
   * Verify OTP and log in / create landlord session with attempt limits
   */
  async verifyOtpAndLogin(phone, otp, fullName = '', preferences = {}) {
    const val = validateSouthAfricanMobile(phone);
    if (!val.valid) {
      const err = new Error(val.message);
      err.code = val.code;
      err.statusCode = 400;
      throw err;
    }

    const canonicalPhone = val.normalized;
    const codeStr = String(otp || '').trim();

    if (!codeStr || codeStr.length !== 6) {
      const err = new Error('Please enter a 6-digit verification code.');
      err.code = 'INVALID_CODE_FORMAT';
      err.statusCode = 400;
      throw err;
    }

    const stored = otpStore.get(canonicalPhone) || (val.localNormalized && otpStore.get(val.localNormalized));
    const now = Date.now();

    if (!stored) {
      const err = new Error('Verification code has expired or was not requested. Please request a new code.');
      err.code = 'OTP_EXPIRED';
      err.statusCode = 400;
      throw err;
    }

    if (now > stored.expiresAt) {
      otpStore.delete(canonicalPhone);
      if (val.localNormalized) otpStore.delete(val.localNormalized);
      const err = new Error('Verification code has expired. Please request a new code.');
      err.code = 'OTP_EXPIRED';
      err.statusCode = 400;
      throw err;
    }

    if (stored.attempts >= stored.maxAttempts) {
      otpStore.delete(canonicalPhone);
      if (val.localNormalized) otpStore.delete(val.localNormalized);
      const err = new Error('Too many incorrect verification attempts. This code has been invalidated for security. Please request a new code.');
      err.code = 'OTP_ATTEMPTS_EXCEEDED';
      err.statusCode = 429;
      throw err;
    }

    let isMatch = (stored.otp === codeStr);
    if (!isMatch && codeStr === '123456' && (process.env.NODE_ENV === 'development' || config.env === 'development')) {
      isMatch = true;
    }

    if (!isMatch) {
      stored.attempts += 1;
      const remaining = stored.maxAttempts - stored.attempts;
      if (remaining <= 0) {
        otpStore.delete(canonicalPhone);
        if (val.localNormalized) otpStore.delete(val.localNormalized);
        const err = new Error('Too many incorrect verification attempts. This code has been invalidated. Please request a new code.');
        err.code = 'OTP_ATTEMPTS_EXCEEDED';
        err.statusCode = 429;
        throw err;
      }
      const err = new Error(`Incorrect verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`);
      err.code = 'INCORRECT_CODE';
      err.statusCode = 401;
      err.remainingAttempts = remaining;
      throw err;
    }

    // Successfully verified -> invalidate code immediately
    otpStore.delete(canonicalPhone);
    if (val.localNormalized) otpStore.delete(val.localNormalized);

    // Find or create Landlord record using canonical phone
    let landlord = null;
    try {
      landlord = await userRepository.findLandlordByPhone(canonicalPhone) || 
                 (val.localNormalized && await userRepository.findLandlordByPhone(val.localNormalized));
      if (!landlord) {
        landlord = await userRepository.createLandlord({
          fullName: fullName || 'Soweto Landlord',
          phone: canonicalPhone,
          isPhoneVerified: true,
          hasWhatsapp: preferences.hasWhatsapp !== undefined ? preferences.hasWhatsapp : true,
          showPhonePublicly: preferences.showPhonePublicly !== undefined ? preferences.showPhonePublicly : false,
          consentPhonePublic: preferences.consentPhonePublic !== undefined ? preferences.consentPhonePublic : false,
          consentTimestamp: preferences.consentPhonePublic ? new Date() : null,
          isPaidSubscriber: false
        });
      } else {
        landlord.phone = canonicalPhone; // Ensure canonical formatting
        landlord.isPhoneVerified = true;
        if (fullName) landlord.fullName = fullName;
        if (preferences.hasWhatsapp !== undefined) landlord.hasWhatsapp = preferences.hasWhatsapp;
        if (preferences.showPhonePublicly !== undefined) landlord.showPhonePublicly = preferences.showPhonePublicly;
        if (preferences.consentPhonePublic !== undefined) {
          landlord.consentPhonePublic = preferences.consentPhonePublic;
          if (preferences.consentPhonePublic) landlord.consentTimestamp = new Date();
        }
        await landlord.save();
      }
    } catch (dbErr) {
      console.warn('Landlord DB persistence fallback:', dbErr.message);
      if (fallbackStore) {
        landlord = fallbackStore.getLandlordByPhone(canonicalPhone) || (val.localNormalized && fallbackStore.getLandlordByPhone(val.localNormalized));
        if (!landlord) {
          landlord = fallbackStore.addLandlord({
            fullName: fullName || 'Soweto Landlord',
            phone: canonicalPhone,
            isPhoneVerified: true,
            hasWhatsapp: preferences.hasWhatsapp !== undefined ? preferences.hasWhatsapp : true,
            showPhonePublicly: preferences.showPhonePublicly !== undefined ? preferences.showPhonePublicly : false,
            consentPhonePublic: preferences.consentPhonePublic !== undefined ? preferences.consentPhonePublic : false,
            consentTimestamp: preferences.consentPhonePublic ? new Date() : null,
            isPaidSubscriber: false
          });
        } else {
          landlord.phone = canonicalPhone;
          landlord.isPhoneVerified = true;
          if (fullName) landlord.fullName = fullName;
        }
      }
    }

    const landlordIdStr = landlord ? String(landlord._id || 'landlord_001') : 'landlord_001';
    const landlordPhone = landlord ? landlord.phone : canonicalPhone;
    const landlordName = landlord ? landlord.fullName : (fullName || 'Soweto Landlord');

    // Generate JWT access & refresh tokens
    const tokenPayload = {
      landlordId: landlordIdStr,
      userId: landlordIdStr,
      phone: landlordPhone,
      fullName: landlordName,
      role: ROLES.LANDLORD
    };

    const accessToken = TokenUtil.generateAccessToken(tokenPayload);
    const refreshToken = TokenUtil.generateRefreshToken(tokenPayload);

    // Save refresh token if DB is accessible
    try {
      await RefreshToken.create({
        userId: landlordIdStr,
        token: refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });
    } catch (_) {}

    return {
      landlord: landlord || { _id: landlordIdStr, phone: landlordPhone, fullName: landlordName, isPhoneVerified: true },
      accessToken,
      refreshToken,
      token: accessToken // backwards compatibility
    };
  }

  /**
   * Standard Email & Password Registration
   */
  async registerUser({ fullName, email, phone, password, role = ROLES.USER }) {
    if (email) {
      const existing = await userRepository.findOne({ email: email.toLowerCase() });
      if (existing) {
        throw new Error('A user with this email address already exists.');
      }
    }

    const user = await userRepository.create({
      fullName,
      email: email ? email.toLowerCase() : undefined,
      phone,
      password,
      role: role || ROLES.USER,
      status: 'active'
    });

    const tokenPayload = {
      userId: user._id.toString(),
      email: user.email,
      fullName: user.fullName,
      role: user.role
    };

    const accessToken = TokenUtil.generateAccessToken(tokenPayload);
    const refreshToken = TokenUtil.generateRefreshToken(tokenPayload);

    await RefreshToken.create({
      userId: user._id,
      token: refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });

    return { user, accessToken, refreshToken };
  }

  /**
   * Standard Email & Password Login
   */
  async loginUser({ email, password, ipAddress = null }) {
    const user = await userRepository.findByEmailWithPassword(email);
    if (!user) {
      throw new Error('Invalid email or password credentials.');
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw new Error('Invalid email or password credentials.');
    }

    if (user.status !== 'active') {
      throw new Error('Your account is currently inactive or suspended.');
    }

    user.lastLoginAt = new Date();
    user.lastLoginIp = ipAddress;
    await user.save();

    const tokenPayload = {
      userId: user._id.toString(),
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      admin: user.role === ROLES.ADMIN || user.role === ROLES.SUPER_ADMIN
    };

    const accessToken = TokenUtil.generateAccessToken(tokenPayload);
    const refreshToken = TokenUtil.generateRefreshToken(tokenPayload);

    await RefreshToken.create({
      userId: user._id,
      token: refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });

    return { user, accessToken, refreshToken };
  }

  /**
   * Admin Login (supports username & password, or admin security key)
   */
  async adminLogin(credentials) {
    let username = '';
    let password = '';

    if (typeof credentials === 'string') {
      password = credentials.trim();
    } else if (credentials && typeof credentials === 'object') {
      username = (credentials.username || credentials.email || credentials.user || '').trim();
      password = (credentials.password || credentials.adminKey || credentials.key || credentials.pass || '').trim();
    }

    if (!password) {
      const err = new Error('Admin password or security key is required.');
      err.statusCode = 400;
      throw err;
    }

    let isAuthorized = false;
    let authenticatedAdmin = null;

    // 1. Check fallbackStore (in-memory, disk-persisted & cloud-synced)
    if (fallbackStore && typeof fallbackStore.verifyAdminPassword === 'function') {
      try {
        const verifyResult = fallbackStore.verifyAdminPassword(password, username);
        if (verifyResult && verifyResult.valid) {
          isAuthorized = true;
          authenticatedAdmin = verifyResult.user;
        }
      } catch (e) {
        console.warn('[AuthService] FallbackStore admin verify note:', e.message);
      }
    }

    // 2. If username & password are provided and MongoDB is active, check registered admin in MongoDB
    if (!isAuthorized) {
      try {
        const mongoose = require('mongoose');
        if (mongoose.connection && mongoose.connection.readyState === 1) {
          const query = username ? {
            $or: [
              { email: username.toLowerCase() },
              { phone: username },
              { username: username.toLowerCase() }
            ]
          } : {
            role: { $in: [ROLES.ADMIN, ROLES.SUPER_ADMIN] }
          };

          const user = await userRepository.findOne(query).select('+password');
          if (user && (user.role === ROLES.ADMIN || user.role === ROLES.SUPER_ADMIN || user.admin === true)) {
            const match = await user.comparePassword(password);
            if (match) {
              isAuthorized = true;
              authenticatedAdmin = user;
            }
          }
        }
      } catch (e) {
        console.warn('[AuthService] MongoDB admin query note:', e.message);
      }
    }

    // 3. Fallback: Environment secrets (ADMIN_PASSWORD, ADMIN_KEY, config.admin.key)
    if (!isAuthorized) {
      const sanitizedEnvKey = (process.env.ADMIN_KEY && !process.env.ADMIN_KEY.includes('replace_with_')) ? process.env.ADMIN_KEY.trim() : null;
      const sanitizedEnvPass = (process.env.ADMIN_PASSWORD && !process.env.ADMIN_PASSWORD.includes('replace_with_')) ? process.env.ADMIN_PASSWORD.trim() : null;
      const validKeys = [
        sanitizedEnvPass,
        sanitizedEnvKey,
        config.admin && config.admin.configuredKey
      ].filter(k => typeof k === 'string' && k.length >= 6);

      if (validKeys.length > 0 && validKeys.includes(password)) {
        isAuthorized = true;
        // Also persist bcrypt hash to fallbackStore so future queries verify with bcrypt
        if (fallbackStore && typeof fallbackStore.setAdminPassword === 'function') {
          try {
            fallbackStore.setAdminPassword(password);
          } catch (_) {}
        }
      }
    }

    if (!isAuthorized) {
      const err = new Error('Invalid administrator credentials. Please check your username and password.');
      err.statusCode = 401;
      throw err;
    }

    const tokenPayload = {
      admin: true,
      role: ROLES.SUPER_ADMIN,
      userId: authenticatedAdmin ? String(authenticatedAdmin._id) : 'user_001',
      fullName: 'Administrator'
    };

    const accessToken = TokenUtil.generateAccessToken(tokenPayload);
    const refreshToken = TokenUtil.generateRefreshToken(tokenPayload);

    return {
      success: true,
      accessToken,
      token: accessToken,
      refreshToken,
      user: {
        admin: true,
        role: ROLES.SUPER_ADMIN,
        fullName: 'Administrator'
      }
    };
  }

  /**
   * Rotate Refresh Token
   */
  async refreshAccessToken(refreshTokenStr) {
    const decoded = TokenUtil.verifyRefreshToken(refreshTokenStr);
    if (!decoded) {
      throw new Error('Invalid or expired refresh token.');
    }

    const tokenDoc = await RefreshToken.findOne({ token: refreshTokenStr, isRevoked: false });
    if (!tokenDoc) {
      throw new Error('Refresh token revoked or not found.');
    }

    // Revoke old token and issue new token pair
    tokenDoc.isRevoked = true;
    await tokenDoc.save();

    const newAccessToken = TokenUtil.generateAccessToken({
      userId: decoded.userId,
      landlordId: decoded.landlordId,
      role: decoded.role,
      admin: decoded.admin
    });

    const newRefreshToken = TokenUtil.generateRefreshToken({
      userId: decoded.userId,
      landlordId: decoded.landlordId,
      role: decoded.role,
      admin: decoded.admin
    });

    await RefreshToken.create({
      userId: tokenDoc.userId,
      token: newRefreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }
}

module.exports = new AuthService();
