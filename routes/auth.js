const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Landlord = require('../models/Landlord');
const fallbackStore = require('../services/fallbackStore');
const otpService = require('../services/otpService');
const verifyTurnstile = require('../middleware/verifyTurnstile');
const { otpIpLimiter, otpVerifyLimiter } = require('../middleware/rateLimiters');

function normalizeSAPhone(phone) {
  let cleaned = String(phone || '').replace(/\D/g, '');
  if (cleaned.startsWith('0')) cleaned = '27' + cleaned.substring(1);
  if (!cleaned.startsWith('27')) cleaned = '27' + cleaned;
  return '+' + cleaned;
}

// 1. REQUEST OTP
router.post('/request-otp', otpIpLimiter, verifyTurnstile, async (req, res) => {
  try {
    const { phone, fullName, hasWhatsapp, showPhonePublicly, consentPhonePublic } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number is required.' });

    // Showing the number publicly requires explicit consent
    if (showPhonePublicly && !consentPhonePublic) {
      return res.status(400).json({ error: 'Consent is required to show your phone number publicly.' });
    }

    const formattedPhone = normalizeSAPhone(phone);
    if (!/^\+27[6-8]\d{8}$/.test(formattedPhone)) {
      return res.status(400).json({ error: 'Invalid South African cell number.' });
    }

    const contactPrefs = {
      hasWhatsapp: hasWhatsapp !== false,
      showPhonePublicly: !!showPhonePublicly,
      consentPhonePublic: !!showPhonePublicly && !!consentPhonePublic,
      consentTimestamp: showPhonePublicly && consentPhonePublic ? new Date() : null
    };

    if (mongoose.connection.readyState === 1) {
      let landlord = await Landlord.findOne({ phone: formattedPhone });
      if (!landlord) {
        landlord = await Landlord.create({ fullName: fullName || 'Landlord', phone: formattedPhone, ...contactPrefs });
      } else {
        landlord.hasWhatsapp = contactPrefs.hasWhatsapp;
        landlord.showPhonePublicly = contactPrefs.showPhonePublicly;
        landlord.consentPhonePublic = contactPrefs.consentPhonePublic;
        if (contactPrefs.consentTimestamp) landlord.consentTimestamp = contactPrefs.consentTimestamp;
        await landlord.save();
      }
    } else {
      let landlord = fallbackStore.getLandlordByPhone(formattedPhone);
      if (!landlord) {
        fallbackStore.addLandlord({ fullName: fullName || 'Landlord', phone: formattedPhone, ...contactPrefs });
      }
    }

    const result = await otpService.sendSMSOTP(formattedPhone);

    res.json({
      success: true,
      message: `OTP sent to ${formattedPhone}`,
      devOtp: otpService.isLocalDriver() ? result.mockCode : undefined
    });
  } catch (err) {
    console.error('request-otp error:', err.message);
    res.status(500).json({ error: 'Failed to dispatch SMS.' });
  }
});

// 2. VERIFY OTP
router.post('/verify-otp', otpVerifyLimiter, async (req, res) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) return res.status(400).json({ error: 'Phone and code are required.' });

    const formattedPhone = normalizeSAPhone(phone);
    const isValid = await otpService.verifySMSOTP(formattedPhone, code);

    if (!isValid) {
      return res.status(401).json({ error: 'Incorrect or expired OTP code.' });
    }

    let landlord = null;
    if (mongoose.connection.readyState === 1) {
      landlord = await Landlord.findOneAndUpdate(
        { phone: formattedPhone },
        { isPhoneVerified: true },
        { new: true }
      );
    }
    
    if (!landlord) {
      landlord = fallbackStore.getLandlordByPhone(formattedPhone);
      if (landlord) {
        landlord.isPhoneVerified = true;
      } else {
        landlord = fallbackStore.addLandlord({ phone: formattedPhone, fullName: 'Landlord', isPhoneVerified: true });
      }
    }

    const token = jwt.sign(
      { landlordId: landlord._id, phone: landlord.phone },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    res.json({
      success: true,
      landlord: { id: landlord._id, fullName: landlord.fullName, phone: landlord.phone }
    });
  } catch (err) {
    console.error('verify-otp error:', err.message);
    res.status(500).json({ error: 'Verification failed.' });
  }
});

// 3. LOGOUT
router.post('/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.json({ success: true });
});

// 4. DEBUG ENDPOINT FOR TEST AUTOMATION (dev only)
router.get('/debug/last-otp', (req, res) => {
  if (!otpService.isLocalDriver()) {
    return res.status(403).json({ error: 'Disabled in production.' });
  }

  const formattedPhone = normalizeSAPhone(req.query.phone || '');
  const { localOtpStore } = require('../services/mockSmsDriver');
  const record = localOtpStore.get(formattedPhone);

  if (!record) return res.status(404).json({ error: 'No active OTP found.' });
  res.json({ phone: formattedPhone, otp: record.code });
});

module.exports = router;
