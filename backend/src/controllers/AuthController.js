const authService = require('../services/AuthService');
const AuthValidator = require('../validators/authValidator');
const ApiResponse = require('../utils/apiResponse');
const auditLogRepository = require('../repositories/AuditLogRepository');

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
      return ApiResponse.success(res, result.message, result, 200, {
        phone: result.phone,
        displayPhone: result.displayPhone,
        maskedPhone: result.maskedPhone,
        retryAfter: result.retryAfter,
        cooldownExpiresAt: result.cooldownExpiresAt,
        otp: result.otp,
        devOtp: result.devOtp,
        code: result.code
      });
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

      // Set cookies for browser sessions
      res.cookie('landlordToken', result.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      res.cookie('auth_token', result.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      return ApiResponse.success(res, 'Phone verified and authenticated successfully.', result, 200, {
        token: result.accessToken,
        landlord: result.landlord
      });
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
      return ApiResponse.success(res, 'User registered successfully.', result, 201);
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

      return ApiResponse.success(res, 'Logged in successfully.', result);
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

      const adminEmail = (result.user && result.user.email) || username || '12rakosadavid@gmail.com';
      await auditLogRepository.logAction({
        actorEmail: adminEmail,
        actorRole: 'ADMIN',
        action: 'LOGIN',
        entityType: 'AdminAuth',
        result: 'SUCCESS',
        status: 'SUCCESS',
        ipAddress,
        userAgent,
        details: { adminEmail, loginMethod: 'PASSWORD_OR_KEY' }
      }).catch(() => {});

      return ApiResponse.success(res, 'Admin authentication successful.', {
        authenticated: true,
        accessToken: result.accessToken,
        token: result.accessToken,
        user: result.user || { role: 'ADMIN', admin: true, email: adminEmail, fullName: username || 'System Administrator' }
      }, 200, {
        token: result.accessToken,
        authenticated: true,
        user: result.user
      });
    } catch (err) {
      await auditLogRepository.logAction({
        actorEmail: username || 'UNKNOWN',
        actorRole: 'ANONYMOUS',
        action: 'LOGIN',
        entityType: 'AdminAuth',
        result: 'FAILED',
        status: 'FAILURE',
        failureReason: 'INVALID_CREDENTIALS',
        ipAddress,
        userAgent,
        details: { username: username || null, failureReason: 'INVALID_CREDENTIALS' }
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
      return ApiResponse.success(res, 'Access token refreshed successfully.', result);
    } catch (err) {
      return ApiResponse.error(res, err.message, 401);
    }
  }

  async logout(req, res, next) {
    res.clearCookie('landlordToken');
    res.clearCookie('auth_token');
    res.clearCookie('adminSession');
    return ApiResponse.success(res, 'Logged out successfully.');
  }

  async getMe(req, res, next) {
    if (!req.user) {
      return ApiResponse.error(res, 'Not authenticated', 401);
    }
    return ApiResponse.success(res, 'Profile retrieved', req.user);
  }
}

module.exports = new AuthController();
