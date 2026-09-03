const { validateSouthAfricanMobile } = require('../utils/phoneUtils');

class RoomRequestValidator {
  static validateCreate(data) {
    const errors = [];
    if (!data.seekerName || typeof data.seekerName !== 'string' || data.seekerName.trim().length < 2) {
      errors.push('Your name is required.');
    }
    const phoneVal = validateSouthAfricanMobile(data.phone);
    if (!phoneVal.valid) {
      errors.push(phoneVal.message);
    }
    if (!data.suburb || typeof data.suburb !== 'string' || data.suburb.trim().length < 2) {
      errors.push('Suburb is required.');
    }
    const budget = Number(data.maxBudget);
    if (isNaN(budget) || budget < 300 || budget > 50000) {
      errors.push('Maximum budget must be between R300 and R50,000.');
    }
    return { isValid: errors.length === 0, errors, phoneValidation: phoneVal };
  }
}

class UserValidator {
  static validateUpdate(data) {
    const errors = [];
    if (data.email && !/^\S+@\S+\.\S+$/.test(data.email)) {
      errors.push('Please provide a valid email.');
    }
    return { isValid: errors.length === 0, errors };
  }
}

class AdminValidator {
  static validateLogin(data) {
    const errors = [];
    if (!data.adminKey || typeof data.adminKey !== 'string') {
      errors.push('Admin key is required.');
    }
    return { isValid: errors.length === 0, errors };
  }
}

module.exports = {
  RoomRequestValidator,
  UserValidator,
  AdminValidator
};
