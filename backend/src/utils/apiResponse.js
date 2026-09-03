/**
 * Standardized API Response Utilities
 */

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
    const payload = {
      success: true,
      message,
      data,
      ...extraFields
    };
    return res.status(statusCode).json(payload);
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
    const payload = {
      success: false,
      message,
      errors: Array.isArray(errors) ? errors : [errors],
      error: message // Backwards compatibility for legacy frontend checking res.error
    };
    if (code) {
      payload.code = code;
    }
    return res.status(statusCode).json(payload);
  }

  /**
   * Send a paginated success response
   */
  static paginated(res, message, items, page, limit, total, extra = {}) {
    const totalPages = Math.ceil(total / (limit || 1)) || 1;
    return res.status(200).json({
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
    });
  }
}

module.exports = ApiResponse;
