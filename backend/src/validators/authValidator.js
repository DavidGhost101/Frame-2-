const { validateSouthAfricanMobile } = require('../utils/phoneUtils');

class AuthValidator {
  static validateRegister(data) {
    const errors = [];
    if (!data.fullName || typeof data.fullName !== 'string' || data.fullName.trim().length < 2) {
      errors.push('Full name must be at least 2 characters.');
    }
    if (!data.email && !data.phone) {
      errors.push('Either email or phone number is required.');
    }
    if (data.email && !/^\S+@\S+\.\S+$/.test(data.email)) {
      errors.push('Please enter a valid email address.');
    }
    if (data.phone) {
      const phoneValidation = validateSouthAfricanMobile(data.phone);
      if (!phoneValidation.valid) {
        errors.push(phoneValidation.message);
      }
    }
    if (data.password && (typeof data.password !== 'string' || data.password.length < 6)) {
      errors.push('Password must be at least 6 characters long.');
    }
    return { isValid: errors.length === 0, errors };
  }

  static validateLogin(data) {
    const errors = [];
    if (!data.email && !data.phone && !data.adminKey) {
      errors.push('Email, phone, or admin key is required for login.');
    }
    return { isValid: errors.length === 0, errors };
  }

  static validateOtpRequest(data) {
    const errors = [];
    const rawPhone = data.phone ? String(data.phone).trim() : '';
    const phoneValidation = validateSouthAfricanMobile(rawPhone);

    if (!phoneValidation.valid) {
      errors.push(phoneValidation.message);
    }

    if (data.showPhonePublicly && !data.consentPhonePublic && !data.consent) {
      errors.push('Consent is required to display your phone number publicly on listings.');
    }

    return {
      isValid: errors.length === 0,
      errors,
      phoneValidation
    };
  }

  static validateOtpVerify(data) {
    const errors = [];
    const rawPhone = data.phone ? String(data.phone).trim() : '';
    const otp = data.otp || data.code;

    const phoneValidation = validateSouthAfricanMobile(rawPhone);
    if (!phoneValidation.valid) {
      errors.push(phoneValidation.message);
    }

    if (!otp || String(otp).trim().length !== 6 || !/^\d{6}$/.test(String(otp).trim())) {
      errors.push('A valid 6-digit numeric verification code is required.');
    }

    return {
      isValid: errors.length === 0,
      errors,
      phoneValidation
    };
  }
}

module.exports = AuthValidator;
