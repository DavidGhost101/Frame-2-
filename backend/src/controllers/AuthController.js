const authService = require('../services/AuthService');
const AuthValidator = require('../validators/authValidator');
const ApiResponse = require('../utils/apiResponse');
const auditLogRepository = require('../repositories/AuditLogRepository');
const { serializeUser, serializeLandlord } = require('../utils/securitySanitizer');

class AuthController {
  async requestOtp(req, res, next) {
    try {
      const validation = AuthValidator.validateOtpRequest(req.body);
      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_MOBILE_FORMAT',
          message: validation.errors[0] || 'Enter a valid South African mobile number.',
          error: validation.errors[0] || 'Enter a valid South African mobile number.',
          errors: validation.errors
        });
      }

      const result = await authService.requestOtp(req.body.phone);
      const safeData = {
        phone: result.phone,
        displayPhone: result.displayPhone,
        maskedPhone: result.maskedPhone,
        retryAfter: result.retryAfter,
        cooldownExpiresAt: result.cooldownExpiresAt,
        ...((process.env.NODE_ENV === 'test' || process.env.SMS_DRIVER === 'local') && result.devOtp ? { devOtp: result.devOtp } : {})
      };

      return ApiResponse.success(res, result.message, safeData, 200, safeData);
    } catch (err) {
      const status = err.statusCode || (err.code === 'OTP_COOLDOWN' ? 429 : 400);
      return res.status(status).json({
        success: false,
        code: err.code || 'OTP_REQUEST_FAILED',
        message: err.message,
        error: err.message,
        retryAfter: err.retryAfter
      });
    }
  }

  async verifyOtp(req, res, next) {
    try {
      const validation = AuthValidator.validateOtpVerify(req.body);
      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          code: 'VALIDATION_ERROR',
          message: validation.errors[0] || 'Validation error',
          error: validation.errors[0] || 'Validation error',
          errors: validation.errors
        });
      }

      const phone = req.body.phone;
      const otp = req.body.otp || req.body.code;
      const fullName = req.body.fullName;
      const { hasWhatsapp, showPhonePublicly, consentPhonePublic } = req.body;

      const result = await authService.verifyOtpAndLogin(phone, otp, fullName, {
        hasWhatsapp,
        showPhonePublicly,
        consentPhonePublic
      });

      // Set secure HTTP-only cookies for browser sessions
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000
      };

      res.cookie('landlordToken', result.accessToken, cookieOptions);
      res.cookie('auth_token', result.accessToken, cookieOptions);

      const safeLandlord = serializeLandlord(result.landlord, true);
      const safeResponse = {
        authenticated: true,
        token: result.accessToken,
        accessToken: result.accessToken,
        landlord: safeLandlord
      };

      return ApiResponse.success(res, 'Phone verified and authenticated successfully.', safeResponse, 200, safeResponse);
    } catch (err) {
      const status = err.statusCode || 401;
      return res.status(status).json({
        success: false,
        code: err.code || 'VERIFICATION_FAILED',
        message: err.message,
        error: err.message,
        remainingAttempts: err.remainingAttempts
      });
    }
  }

  async register(req, res, next) {
    try {
      const validation = AuthValidator.validateRegister(req.body);
      if (!validation.isValid) {
        return ApiResponse.error(res, validation.errors[0] || 'Validation error', 400, validation.errors);
      }

      const result = await authService.registerUser(req.body);
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000
      };

      res.cookie('auth_token', result.accessToken, cookieOptions);

      const safeUser = serializeUser(result.user, true);
      const safeResponse = {
        user: safeUser,
        token: result.accessToken,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken
      };

      return ApiResponse.success(res, 'User registered successfully.', safeResponse, 201, safeResponse);
    } catch (err) {
      next(err);
    }
  }

  async login(req, res, next) {
    try {
      const validation = AuthValidator.validateLogin(req.body);
      if (!validation.isValid) {
        return ApiResponse.error(res, validation.errors[0] || 'Validation error', 400, validation.errors);
      }

      const result = await authService.loginUser({
        email: req.body.email,
        password: req.body.password,
        ipAddress: req.ip
      });

      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000
      };

      res.cookie('auth_token', result.accessToken, cookieOptions);

      const safeUser = serializeUser(result.user, true);
      const safeResponse = {
        user: safeUser,
        token: result.accessToken,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken
      };

      return ApiResponse.success(res, 'Logged in successfully.', safeResponse, 200, safeResponse);
    } catch (err) {
      return ApiResponse.error(res, err.message, 401);
    }
  }

  async adminLogin(req, res, next) {
    const ipAddress =
      req.ip ||
      (req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : null) ||
      (req.socket ? req.socket.remoteAddress : null);
    const userAgent = req.headers['user-agent'] || null;
    const username = (req.body && (req.body.username || req.body.email || req.body.user)) || '';
    const password = (req.body && (req.body.password || req.body.adminKey || req.body.key || req.body.pass)) || req.headers['x-admin-key'] || '';

    try {
      if (!password) {
        await auditLogRepository.logAction({
          actorEmail: username || 'UNKNOWN',
          actorRole: 'ANONYMOUS',
          action: 'LOGIN',
          entityType: 'AdminAuth',
          result: 'FAILED',
          status: 'FAILURE',
          failureReason: 'MISSING_PASSWORD',
          ipAddress,
          userAgent,
          details: { username: username || null, failureReason: 'Password was not provided' }
        }).catch(() => {});

        return ApiResponse.error(res, 'Invalid admin credentials. Please check your username and password.', 401);
      }

      const result = await authService.adminLogin({
        username,
        password
      });

      res.cookie('adminSession', result.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
      });

      await auditLogRepository.logAction({
        actorEmail: 'admin@system.internal',
        actorRole: 'ADMIN',
        action: 'LOGIN',
        entityType: 'AdminAuth',
        result: 'SUCCESS',
        status: 'SUCCESS',
        ipAddress,
        userAgent,
        details: { loginMethod: 'SECURE_AUTH' }
      }).catch(() => {});

      const safeAdminUser = {
        role: 'SUPER_ADMIN',
        admin: true,
        fullName: 'Administrator'
      };

      return ApiResponse.success(res, 'Admin authentication successful.', {
        authenticated: true,
        accessToken: result.accessToken,
        token: result.accessToken,
        user: safeAdminUser
      }, 200, {
        token: result.accessToken,
        authenticated: true,
        user: safeAdminUser
      });
    } catch (err) {
      await auditLogRepository.logAction({
        actorEmail: 'anonymous',
        actorRole: 'ANONYMOUS',
        action: 'LOGIN',
        entityType: 'AdminAuth',
        result: 'FAILED',
        status: 'FAILURE',
        failureReason: 'INVALID_CREDENTIALS',
        ipAddress,
        userAgent,
        details: { failureReason: 'INVALID_CREDENTIALS' }
      }).catch(() => {});

      return ApiResponse.error(res, 'Invalid admin credentials. Please check your username and password.', 401);
    }
  }

  async refreshToken(req, res, next) {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        return ApiResponse.error(res, 'Refresh token required.', 400);
      }

      const result = await authService.refreshAccessToken(refreshToken);
      return ApiResponse.success(res, 'Access token refreshed successfully.', {
        accessToken: result.accessToken,
        token: result.accessToken
      });
    } catch (err) {
      return ApiResponse.error(res, err.message, 401);
    }
  }

  async logout(req, res, next) {
    const clearOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    };
    res.clearCookie('landlordToken', clearOptions);
    res.clearCookie('auth_token', clearOptions);
    res.clearCookie('adminSession', clearOptions);
    return ApiResponse.success(res, 'Logged out successfully.');
  }

  async getMe(req, res, next) {
    if (!req.user) {
      return ApiResponse.error(res, 'Not authenticated', 401);
    }
    const isLandlord = req.user.role === 'LANDLORD' || req.user.landlordId;
    const safeData = isLandlord ? serializeLandlord(req.user, true) : serializeUser(req.user, true);
    return ApiResponse.success(res, 'Profile retrieved', safeData);
  }
}

module.exports = new AuthController();
