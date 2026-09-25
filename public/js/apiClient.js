/**
 * Rent A Room Soweto - Centralized Global API Client & Error Interceptor
 * Intercepts HTTP status codes and backend error contracts, translating them
 * into standardized, user-friendly toast notifications and structured return payloads.
 */
(function (global) {
  'use strict';

  function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'req-' + Date.now() + '-' + Math.random().toString(36).substring(2, 11);
  }

  /**
   * Interpret machine response code and HTTP status code into user-friendly message and category
   */
  function interpretError(status, data, defaultMsg = 'An unexpected error occurred.') {
    const code = data?.code || data?.error?.code || null;
    const rawMsg = data?.message || data?.error || (Array.isArray(data?.errors) ? data.errors[0] : null) || defaultMsg;
    const retryAfter = data?.retryAfter || (data?.error && data.error.retryAfter) || null;
    const details = data?.details || (data?.errors && data.errors.length > 1 ? data.errors : null) || null;

    let toastType = 'SERVER_ERROR';
    let userMessage = rawMsg;

    switch (status) {
      case 400:
        toastType = 'VALIDATION_ERROR';
        if (code === 'INVALID_MOBILE_FORMAT') {
          userMessage = 'Enter a valid South African mobile number (e.g., 082 123 4567).';
        } else if (code === 'VALIDATION_ERROR' || code === 'INVALID_INPUT') {
          userMessage = rawMsg || 'Please correct the highlighted fields and try again.';
        }
        break;

      case 401:
        toastType = 'AUTHENTICATION_ERROR';
        if (code === 'OTP_INVALID' || code === 'VERIFICATION_FAILED') {
          userMessage = 'The verification code entered is invalid or has expired.';
        } else if (code === 'INVALID_CREDENTIALS') {
          userMessage = 'Invalid username or password. Please verify your credentials.';
        } else if (code === 'SESSION_EXPIRED') {
          userMessage = 'Your session has expired. Please sign in again.';
        } else {
          userMessage = rawMsg || 'Authentication required to complete this action.';
        }
        break;

      case 403:
        toastType = 'AUTHORIZATION_ERROR';
        if (code === 'LANDLORD_BLOCKED' || String(rawMsg).toLowerCase().includes('blocked')) {
          userMessage = 'Your account has been restricted by platform administration. Please contact support.';
        } else if (code === 'INSUFFICIENT_PERMISSIONS') {
          userMessage = 'You do not have permission to perform this administrative action.';
        } else {
          userMessage = rawMsg || 'Access denied. You do not have permission for this resource.';
        }
        break;

      case 404:
        toastType = 'WARNING';
        userMessage = rawMsg || 'The requested property or record could not be found.';
        break;

      case 408:
      case 504:
        toastType = 'TIMEOUT';
        userMessage = 'The request timed out while contacting the server. Please check your connection and retry.';
        break;

      case 409:
        toastType = 'VALIDATION_ERROR';
        if (code === 'DUPLICATE_SUBMISSION') {
          userMessage = 'A duplicate submission is already being processed. Please wait a moment.';
        } else {
          userMessage = rawMsg || 'A conflicting record already exists in the system.';
        }
        break;

      case 422:
        toastType = 'VALIDATION_ERROR';
        userMessage = rawMsg || 'The submission could not be processed due to formatting errors.';
        break;

      case 429:
        toastType = 'RATE_LIMITED';
        if (retryAfter) {
          userMessage = `Too many requests. Please wait ${retryAfter} seconds before trying again.`;
        } else {
          userMessage = rawMsg || 'Request limit reached. Please wait a few moments before trying again.';
        }
        break;

      case 500:
      case 502:
      case 503:
      default:
        toastType = 'SERVER_ERROR';
        userMessage = 'The system is temporarily unable to process your request. Please try again shortly.';
        break;
    }

    return {
      status,
      code,
      message: userMessage,
      toastType,
      details,
      retryAfter
    };
  }

  /**
   * Centralized safe fetch helper with interceptor, timeout, idempotency and toast notification support
   */
  async function apiFetch(url, options = {}) {
    const {
      timeout = 15000,
      showErrorToast = true,
      showSuccessToast = null,
      idempotencyKey = null,
      ...fetchOptions
    } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    fetchOptions.signal = controller.signal;

    // Headers setup
    const headers = new Headers(fetchOptions.headers || {});
    if (!headers.has('Accept')) {
      headers.set('Accept', 'application/json');
    }
    if (!headers.has('X-Request-Id')) {
      headers.set('X-Request-Id', generateUUID());
    }

    // Auto-apply or accept Idempotency-Key for state-changing mutations
    const method = (fetchOptions.method || 'GET').toUpperCase();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      if (idempotencyKey) {
        headers.set('Idempotency-Key', idempotencyKey);
      }
    }

    fetchOptions.headers = headers;

    try {
      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);

      // Parse JSON response body safely
      let data = null;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          data = await response.json();
        } catch (_) {
          data = null;
        }
      } else {
        const text = await response.text();
        try {
          data = JSON.parse(text);
        } catch (_) {
          data = { rawText: text };
        }
      }

      // Check for Retry-After header
      const retryAfterHeader = response.headers.get('Retry-After');
      let retryAfterSeconds = null;
      if (retryAfterHeader) {
        retryAfterSeconds = parseInt(retryAfterHeader, 10) || null;
      }
      if (retryAfterSeconds && data && typeof data === 'object') {
        data.retryAfter = data.retryAfter || retryAfterSeconds;
      }

      if (!response.ok) {
        const interpreted = interpretError(response.status, data);

        if (showErrorToast && global.AppToast) {
          global.AppToast.show(interpreted.message, {
            type: interpreted.toastType,
            details: interpreted.details,
            retryAfter: interpreted.retryAfter
          });
        }

        const error = new Error(interpreted.message);
        error.status = response.status;
        error.code = interpreted.code;
        error.data = data;
        error.interpreted = interpreted;
        error.response = response;
        throw error;
      }

      // Successful response
      if (showSuccessToast && global.AppToast) {
        const successMsg = typeof showSuccessToast === 'string'
          ? showSuccessToast
          : (data?.message || 'Operation completed successfully.');
        global.AppToast.success(successMsg);
      }

      return {
        ok: true,
        status: response.status,
        data,
        response
      };
    } catch (err) {
      clearTimeout(timeoutId);

      // Handle Network / Timeout errors
      if (err.name === 'AbortError') {
        const timeoutInterpreted = {
          status: 408,
          code: 'REQUEST_TIMEOUT',
          message: 'Request timed out. The server took too long to respond.',
          toastType: 'TIMEOUT'
        };
        if (showErrorToast && global.AppToast) {
          global.AppToast.timeout(timeoutInterpreted.message);
        }
        const timeoutError = new Error(timeoutInterpreted.message);
        timeoutError.status = 408;
        timeoutError.code = 'REQUEST_TIMEOUT';
        timeoutError.interpreted = timeoutInterpreted;
        throw timeoutError;
      }

      if (!err.status && (err instanceof TypeError || String(err.message).toLowerCase().includes('failed to fetch'))) {
        const networkInterpreted = {
          status: 0,
          code: 'NETWORK_ERROR',
          message: 'Unable to connect to the server. Please check your internet connection.',
          toastType: 'NETWORK_ERROR'
        };
        if (showErrorToast && global.AppToast) {
          global.AppToast.network(networkInterpreted.message);
        }
        const netErr = new Error(networkInterpreted.message);
        netErr.status = 0;
        netErr.code = 'NETWORK_ERROR';
        netErr.interpreted = networkInterpreted;
        throw netErr;
      }

      // Re-throw if already processed
      throw err;
    }
  }

  // Expose globally
  global.apiFetch = apiFetch;
  global.interpretError = interpretError;

})(typeof window !== 'undefined' ? window : this);
