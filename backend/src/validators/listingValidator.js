class ListingValidator {
  static validateCreate(data) {
    const errors = [];
    const name = (data.fullName || data.ownerName || data.landlordFullName || data.landlordName || '').trim();
    if (!name) {
      errors.push('Landlord name is required.');
    } else if (/\d/.test(name)) {
      errors.push('Please enter a valid name using letters only.');
    } else if (!/^[a-zA-Z\u00C0-\u024F\s.'-]+$/.test(name) || name.replace(/[^a-zA-Z]/g, '').length < 2) {
      errors.push('Please enter a valid name using letters only.');
    }

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
