/**
 * Standardized API Response Utilities
 */

const { sanitizeData } = require('./securitySanitizer');

class ApiResponse {
  /**
   * Send a success response
   * @param {Object} res - Express response object
   * @param {String} message - Human-readable success message
   * @param {Object|Array} data - Payload data
   * @param {Number} statusCode - HTTP status code (default: 200)
   * @param {Object} extraFields - Additional root-level fields for backwards compatibility
   */
  static success(res, message = 'Operation completed successfully', data = {}, statusCode = 200, extraFields = {}) {
    const rawPayload = {
      success: true,
      message,
      data,
      ...extraFields
    };
    const sanitizedPayload = sanitizeData(rawPayload);
    return res.status(statusCode).json(sanitizedPayload);
  }

  /**
   * Send an error response
   * @param {Object} res - Express response object
   * @param {String} message - Error description
   * @param {Number} statusCode - HTTP status code (default: 500)
   * @param {Array} errors - Array of validation or sub-errors
   * @param {String} code - Error code identifier
   */
  static error(res, message = 'An unexpected error occurred', statusCode = 500, errors = [], code = null) {
    const requestId =
      (res && res.req && (res.req.id || (res.req.headers && res.req.headers['x-request-id']))) ||
      `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    if (res && typeof res.setHeader === 'function') {
      try {
        res.setHeader('X-Request-Id', requestId);
      } catch (_) {}
    }

    // Map status code to standard machine-readable error codes if not provided
    let errorCode = code;
    if (!errorCode) {
      switch (statusCode) {
        case 400:
        case 422:
          errorCode = 'VALIDATION_ERROR';
          break;
        case 401:
          errorCode = 'AUTHENTICATION_REQUIRED';
          break;
        case 403:
          errorCode = 'AUTHORIZATION_REQUIRED';
          break;
        case 404:
          errorCode = 'RESOURCE_NOT_FOUND';
          break;
        case 408:
          errorCode = 'REQUEST_TIMEOUT';
          break;
        case 409:
          errorCode = 'CONFLICT';
          break;
        case 429:
          errorCode = 'RATE_LIMITED';
          break;
        case 502:
        case 503:
        case 504:
          errorCode = 'SERVER_UNAVAILABLE';
          break;
        default:
          errorCode = statusCode >= 500 ? 'SERVER_ERROR' : 'ERROR';
      }
    }

    // Scrub internal stack / database messages from being exposed to clients
    let safeMessage = message;
    if (statusCode >= 500) {
      safeMessage = 'Something went wrong on our side. Please try again later.';
    } else if (typeof safeMessage === 'string') {
      if (
        safeMessage.includes('Mongo') ||
        safeMessage.includes('E11000') ||
        safeMessage.includes('Cast to ObjectId') ||
        safeMessage.includes('node_modules') ||
        safeMessage.includes('stack') ||
        safeMessage.includes('sql') ||
        safeMessage.includes('syntax')
      ) {
        safeMessage = 'A data validation or system error occurred. Please verify your data and try again.';
      }
    }

    const rawPayload = {
      success: false,
      message: safeMessage,
      error: safeMessage,
      code: errorCode,
      errorDetails: {
        code: errorCode,
        message: safeMessage,
        requestId,
        ...(Array.isArray(errors) && errors.length > 0 ? { details: errors } : {})
      },
      errors: Array.isArray(errors) ? errors : [errors].filter(Boolean),
      requestId
    };

    const sanitizedPayload = sanitizeData(rawPayload);
    return res.status(statusCode).json(sanitizedPayload);
  }

  /**
   * Send a paginated success response
   */
  static paginated(res, message, items, page, limit, total, extra = {}) {
    const totalPages = Math.ceil(total / (limit || 1)) || 1;
    const rawPayload = {
      success: true,
      message,
      data: {
        items,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: Number(total),
          totalPages,
          hasNextPage: Number(page) < totalPages,
          hasPrevPage: Number(page) > 1
        }
      },
      // Root-level fields for backwards compatibility with existing UI
      count: items.length,
      total: Number(total),
      page: Number(page),
      ...extra
    };
    const sanitizedPayload = sanitizeData(rawPayload);
    return res.status(200).json(sanitizedPayload);
  }
}

module.exports = ApiResponse;

