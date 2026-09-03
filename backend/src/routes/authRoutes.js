const express = require('express');
const router = express.Router();
const authController = require('../controllers/AuthController');
const { authenticate } = require('../middleware/authMiddleware');
const { authLimiter, otpLimiter } = require('../middleware/rateLimiters');

router.post('/request-otp', otpLimiter, authController.requestOtp);
router.post('/verify-otp', otpLimiter, authController.verifyOtp);
router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.post('/admin-login', authLimiter, authController.adminLogin);
router.post('/admin/login', authLimiter, authController.adminLogin);
router.post('/refresh-token', authController.refreshToken);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.getMe);

module.exports = router;
