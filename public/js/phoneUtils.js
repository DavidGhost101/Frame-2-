/**
 * Client-Side South African Mobile Phone Number Utilities
 * Dynamic formatting, real-time validation, masking, and normalization.
 */

(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SAPhoneUtils = factory();
  }
})(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  const VALID_PREFIXES = ['06', '07', '08'];

  /**
   * Format a user input into South African display format: 0XX XXX XXXX
   */
  function formatMobile(input) {
    if (!input) return '';
    let str = String(input).trim();

    // Strip leading +27 or 27 if user pastes international format
    if (str.startsWith('+27')) {
      str = '0' + str.substring(3);
    } else if (str.startsWith('27') && str.length > 10) {
      str = '0' + str.substring(2);
    }

    // Extract only digits, limit to 10
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
   * Validate South African Mobile Number
   */
  function validateMobile(phone) {
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

    // Extract 9-digit national number
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
          message: 'Please enter a complete 10-digit South African mobile number.',
          normalized: null,
          localNormalized: null,
          formatted: null
        };
      }
      return {
        valid: false,
        code: 'INVALID_LENGTH',
        message: 'Phone number must be exactly 10 digits (e.g. 082 123 4567).',
        normalized: null,
        localNormalized: null,
        formatted: null
      };
    }

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
        message: 'Phone number must be exactly 10 digits (e.g. 082 123 4567).',
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
      message: 'Valid South African mobile number',
      normalized,
      localNormalized,
      formatted
    };
  }

  /**
   * Mask number for OTP display: +27 •• ••• 4567 or 082 ••• 4567
   */
  function maskMobile(phone) {
    if (!phone) return '••••••••••';
    const val = validateMobile(phone);
    if (val.valid) {
      const parts = val.formatted.split(' ');
      if (parts.length === 3) {
        return `${parts[0]} ••• ${parts[2]}`;
      }
    }
    const clean = String(phone).replace(/[\s\-\(\)]/g, '');
    if (clean.length > 4) {
      return `+27 •• ••• ${clean.slice(-4)}`;
    }
    return clean;
  }

  /**
   * Attach smart formatting and real-time validation to an HTML input element
   */
  function attachMask(inputElement, options = {}) {
    if (!inputElement) return;

    const feedbackElement = options.feedbackElement || null;
    const onValidate = options.onValidate || null;

    function update() {
      const cursor = inputElement.selectionStart;
      const oldLen = inputElement.value.length;
      const formatted = formatMobile(inputElement.value);
      inputElement.value = formatted;

      // Adjust cursor position sensibly
      const diff = formatted.length - oldLen;
      const newCursor = Math.max(0, (cursor || 0) + diff);
      try {
        inputElement.setSelectionRange(newCursor, newCursor);
      } catch (_) {}

      // Validation feedback
      const validation = validateMobile(inputElement.value);
      const digitsCount = inputElement.value.replace(/\D/g, '').length;

      if (feedbackElement) {
        if (!inputElement.value.trim()) {
          feedbackElement.innerText = '';
          feedbackElement.className = 'text-[11px] text-slate-500 mt-1';
          inputElement.classList.remove('border-red-500', 'border-emerald-500', 'ring-2', 'ring-red-200', 'ring-emerald-200');
          inputElement.setAttribute('aria-invalid', 'false');
        } else if (validation.valid) {
          feedbackElement.innerText = '✓ Valid South African mobile number';
          feedbackElement.className = 'text-[11px] text-emerald-600 font-semibold mt-1 flex items-center gap-1';
          inputElement.classList.remove('border-red-500', 'ring-red-200');
          inputElement.classList.add('border-emerald-500');
          inputElement.setAttribute('aria-invalid', 'false');
        } else if (digitsCount >= 10 || (digitsCount >= 2 && !['06', '07', '08'].some(p => inputElement.value.startsWith(p)))) {
          feedbackElement.innerText = '✕ ' + validation.message;
          feedbackElement.className = 'text-[11px] text-red-500 font-semibold mt-1 flex items-center gap-1';
          inputElement.classList.remove('border-emerald-500', 'ring-emerald-200');
          inputElement.classList.add('border-red-500');
          inputElement.setAttribute('aria-invalid', 'true');
        } else {
          feedbackElement.innerText = 'Enter 10-digit mobile number starting with 06, 07, or 08';
          feedbackElement.className = 'text-[11px] text-slate-500 mt-1';
          inputElement.classList.remove('border-red-500', 'border-emerald-500');
          inputElement.setAttribute('aria-invalid', 'false');
        }
      }

      if (typeof onValidate === 'function') {
        onValidate(validation);
      }
    }

    inputElement.addEventListener('input', update);
    inputElement.addEventListener('paste', () => setTimeout(update, 0));
    inputElement.addEventListener('blur', update);
  }

  return {
    formatMobile,
    validateMobile,
    maskMobile,
    attachMask,
    toWhatsAppNumber,
    buildWhatsAppUrl,
    VALID_PREFIXES
  };

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

  function buildWhatsAppUrl(phone, text = '') {
    const waNumber = toWhatsAppNumber(phone);
    if (!waNumber) return '';
    const query = text ? `?text=${encodeURIComponent(text)}` : '';
    return `https://wa.me/${waNumber}${query}`;
  }
});

