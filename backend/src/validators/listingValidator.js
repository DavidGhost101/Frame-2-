class ListingValidator {
  static validateCreate(data) {
    const errors = [];
    if (!data.title || typeof data.title !== 'string' || data.title.trim().length < 3) {
      errors.push('Listing title must be at least 3 characters.');
    }
    if (!data.suburb || typeof data.suburb !== 'string' || data.suburb.trim().length < 2) {
      errors.push('Suburb is required.');
    }
    if (!data.address || typeof data.address !== 'string' || data.address.trim().length < 3) {
      errors.push('Address is required.');
    }
    const rent = Number(data.monthlyRent);
    if (isNaN(rent) || rent <= 0 || rent > 100000) {
      errors.push('Monthly rent must be a valid positive amount.');
    }
    return { isValid: errors.length === 0, errors };
  }

  static validateUpdate(data) {
    const errors = [];
    if (data.monthlyRent !== undefined) {
      const rent = Number(data.monthlyRent);
      if (isNaN(rent) || rent <= 0) {
        errors.push('Monthly rent must be a positive number.');
      }
    }
    return { isValid: errors.length === 0, errors };
  }
}

module.exports = ListingValidator;
