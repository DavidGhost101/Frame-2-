/**
 * South African Mobile Phone Number Utilities
 * Handles formatting, masking, normalization, and validation.
 */

// SA Mobile prefixes (06x, 07x, 08x)
const VALID_SA_MOBILE_PREFIXES = ['06', '07', '08'];

/**
 * Normalizes any South African phone number format to canonical E.164 format (+27XXXXXXXXX).
 * Example: '082 123 4567' -> '+27821234567'
 */
function normalizeSouthAfricanMobile(phone) {
  if (!phone) return null;
  const cleaned = String(phone).replace(/[\s\-\(\)\.]/g, '').trim();
  
  if (cleaned.startsWith('+27')) {
    const digits = cleaned.substring(3);
    if (/^[678]\d{8}$/.test(digits)) {
      return '+27' + digits;
    }
  } else if (cleaned.startsWith('27') && !cleaned.startsWith('+')) {
    const digits = cleaned.substring(2);
    if (/^[678]\d{8}$/.test(digits)) {
      return '+27' + digits;
    }
  } else if (cleaned.startsWith('0')) {
    const digits = cleaned.substring(1);
    if (/^[678]\d{8}$/.test(digits)) {
      return '+27' + digits;
    }
  } else if (/^[678]\d{8}$/.test(cleaned)) {
    return '+27' + cleaned;
  }

  // Fallback for general valid numbers
  if (cleaned.startsWith('+')) {
    return cleaned;
  }
  if (/^\d{9,15}$/.test(cleaned)) {
    return cleaned.startsWith('0') ? '+27' + cleaned.substring(1) : '+' + cleaned;
  }

  return null;
}

/**
 * Normalizes to local 10-digit South African format (0821234567).
 */
function normalizeToLocalMobile(phone) {
  if (!phone) return null;
  const cleaned = String(phone).replace(/[\s\-\(\)\.]/g, '').trim();

  if (cleaned.startsWith('+27')) {
    const digits = cleaned.substring(3);
    if (/^[678]\d{8}$/.test(digits)) return '0' + digits;
  } else if (cleaned.startsWith('27') && !cleaned.startsWith('+')) {
    const digits = cleaned.substring(2);
    if (/^[678]\d{8}$/.test(digits)) return '0' + digits;
  } else if (cleaned.startsWith('0')) {
    const digits = cleaned.substring(1);
    if (/^[678]\d{8}$/.test(digits)) return '0' + digits;
  }
  return cleaned;
}

/**
 * Validates a South African mobile number according to national numbering plan.
 * Returns structured validation result.
 */
function validateSouthAfricanMobile(phone) {
  if (!phone || typeof phone !== 'string' || !phone.trim()) {
    return {
      valid: false,
      code: 'EMPTY',
      message: 'Phone number is required.',
      normalized: null,
      localNormalized: null,
      formatted: null
    };
  }

  const raw = String(phone).trim();
  const digitsOnly = raw.replace(/\D/g, '');

  // Check if non-digits other than +, spaces, dashes, parentheses exist
  if (/[^0-9\s\-\(\)\+]/.test(raw)) {
    return {
      valid: false,
      code: 'INVALID_CHARACTERS',
      message: 'Phone number should only contain numbers and standard phone characters.',
      normalized: null,
      localNormalized: null,
      formatted: null
    };
  }

  // Extract national number (9 digits following 0 or +27 / 27)
  let nationalNumber = '';
  if (raw.startsWith('+27')) {
    nationalNumber = raw.substring(3).replace(/\D/g, '');
  } else if (digitsOnly.startsWith('27') && digitsOnly.length === 11) {
    nationalNumber = digitsOnly.substring(2);
  } else if (digitsOnly.startsWith('0') && digitsOnly.length === 10) {
    nationalNumber = digitsOnly.substring(1);
  } else if (digitsOnly.length === 9) {
    nationalNumber = digitsOnly;
  } else {
    if (digitsOnly.length < 9) {
      return {
        valid: false,
        code: 'INCOMPLETE',
        message: 'Enter a full 10-digit South African mobile number.',
        normalized: null,
        localNormalized: null,
        formatted: null
      };
    }
    return {
      valid: false,
      code: 'INVALID_LENGTH',
      message: 'A South African mobile number must contain exactly 10 digits (e.g. 082 123 4567).',
      normalized: null,
      localNormalized: null,
      formatted: null
    };
  }

  // Check prefix: first digit of 9-digit national number must be 6, 7, or 8 (corresponding to 06x, 07x, 08x)
  const firstDigit = nationalNumber.charAt(0);
  if (!['6', '7', '8'].includes(firstDigit)) {
    return {
      valid: false,
      code: 'INVALID_PREFIX',
      message: 'Mobile number must start with 06, 07, or 08 (e.g. 082 123 4567). Landline numbers are not supported.',
      normalized: null,
      localNormalized: null,
      formatted: null
    };
  }

  if (nationalNumber.length !== 9) {
    return {
      valid: false,
      code: 'INVALID_LENGTH',
      message: 'A South African mobile number must contain exactly 10 digits (e.g. 082 123 4567).',
      normalized: null,
      localNormalized: null,
      formatted: null
    };
  }

  const normalized = '+27' + nationalNumber;
  const localNormalized = '0' + nationalNumber;
  const formatted = `${localNormalized.slice(0, 3)} ${localNormalized.slice(3, 6)} ${localNormalized.slice(6)}`;

  return {
    valid: true,
    code: 'OK',
    message: 'Valid South African mobile number.',
    normalized,
    localNormalized,
    formatted
  };
}

/**
 * Format a string of numbers dynamically into 0XX XXX XXXX.
 */
function formatSouthAfricanMobile(input) {
  if (!input) return '';
  let str = String(input).trim();
  
  // Strip +27 or 27 prefix if pasted
  if (str.startsWith('+27')) {
    str = '0' + str.substring(3);
  } else if (str.startsWith('27') && str.length > 10) {
    str = '0' + str.substring(2);
  }

  // Strip all non-digits
  const digits = str.replace(/\D/g, '').slice(0, 10);
  if (!digits) return '';

  if (digits.length <= 3) {
    return digits;
  } else if (digits.length <= 6) {
    return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  } else {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
}

/**
 * Masks a phone number for user privacy in verification UI.
 * Example: '+27821234567' -> '+27 •• ••• 4567' or '082 ••• 4567'
 */
function maskPhoneNumber(phone) {
  if (!phone) return '••••••••••';
  const val = validateSouthAfricanMobile(phone);
  if (val.valid) {
    const formatted = val.formatted; // e.g. "082 123 4567"
    const parts = formatted.split(' ');
    if (parts.length === 3) {
      return `${parts[0]} ••• ${parts[2]}`;
    }
  }
  const clean = String(phone).replace(/[\s\-\(\)]/g, '');
  if (clean.length > 4) {
    const visible = clean.slice(-4);
    return `+27 •• ••• ${visible}`;
  }
  return clean;
}

/**
 * Normalizes any South African or international phone number to clean digits for WhatsApp wa.me / api.whatsapp.com links.
 * South African numbers will always be formatted as '27XXXXXXXXX' (no '+' and no leading '0').
 * Example: '082 123 4567' -> '27821234567'
 * Example: '+27 82 123 4567' -> '27821234567'
 * Example: '27821234567' -> '27821234567'
 */
function toWhatsAppNumber(phone) {
  if (!phone) return '';
  const str = String(phone).trim();
  const digits = str.replace(/\D/g, '');

  if (digits.startsWith('27') && (digits.length === 11 || digits.length === 12)) {
    return digits;
  }
  if (digits.startsWith('0') && digits.length === 10) {
    return '27' + digits.substring(1);
  }
  if (digits.length === 9 && ['6', '7', '8'].includes(digits.charAt(0))) {
    return '27' + digits;
  }
  if (str.startsWith('+27')) {
    return '27' + str.substring(3).replace(/\D/g, '');
  }
  return digits;
}

/**
 * Builds safe wa.me and web.whatsapp.com links with encoded message.
 */
function buildWhatsAppLinks(phone, rawText = '') {
  const cleanNumber = toWhatsAppNumber(phone);
  const text = rawText ? encodeURIComponent(rawText) : '';
  const query = text ? `?text=${text}` : '';
  const webQuery = text ? `&text=${text}` : '';

  return {
    cleanNumber,
    whatsappLink: cleanNumber ? `https://wa.me/${cleanNumber}${query}` : '',
    whatsappWebLink: cleanNumber ? `https://web.whatsapp.com/send?phone=${cleanNumber}${webQuery}` : '',
    callLink: phone ? `tel:${phone}` : ''
  };
}

module.exports = {
  normalizeSouthAfricanMobile,
  normalizeToLocalMobile,
  validateSouthAfricanMobile,
  formatSouthAfricanMobile,
  maskPhoneNumber,
  toWhatsAppNumber,
  buildWhatsAppLinks,
  VALID_SA_MOBILE_PREFIXES
};

