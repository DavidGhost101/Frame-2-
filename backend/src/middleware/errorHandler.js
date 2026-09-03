const ApiResponse = require('../utils/apiResponse');
const Logger = require('../utils/logger');
const fallbackStore = require('../../../services/fallbackStore');

/**
 * Custom Application Error class with HTTP status code support
 */
class AppError extends Error {
  constructor(message, statusCode = 500, errors = [], code = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errors = Array.isArray(errors) ? errors : [errors].filter(Boolean);
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Centralized Express Error Handling Middleware
 * Captures all application errors and returns standardized JSON responses.
 */
function errorHandler(err, req, res, next) {
  // If response headers have already been sent to client, delegate to default Express handler
  if (res.headersSent) {
    return next(err);
  }

  const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
  
  // Default status code and message
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'An unexpected internal server error occurred.';
  let errors = Array.isArray(err.errors) ? err.errors : [];
  let errorCode = err.code && typeof err.code === 'string' ? err.code : null;

  // Log the unhandled or captured error
  Logger.error(`[${req.method || 'UNKNOWN'}] ${req.originalUrl || req.url || '/'} - Error: ${err.message}`, {
    name: err.name,
    statusCode,
    path: req.originalUrl || req.url,
    method: req.method,
    ip: req.ip,
    stack: isDev ? err.stack : undefined
  });

  // 1. JSON Body Parser Syntax Error (Malformed JSON payload)
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    statusCode = 400;
    message = 'Malformed JSON in request payload. Please check your request syntax.';
    errorCode = 'MALFORMED_JSON';
    return ApiResponse.error(res, message, statusCode, errors, errorCode);
  }

  // 2. Database Disconnection & Resilient Fallback Handling
  if (
    err.name === 'MongooseError' ||
    err.name === 'MongoNetworkError' ||
    err.name === 'MongoServerSelectionError' ||
    err.name === 'MongoTimeoutError' ||
    (typeof err.message === 'string' && err.message.includes('buffering timed out'))
  ) {
    if (req.method === 'GET') {
      const pathUrl = (req.originalUrl || req.url || '').toLowerCase();
      if (pathUrl.includes('room-requests') && fallbackStore && fallbackStore.fallbackRequests) {
        return ApiResponse.success(res, 'Loaded from resilient fallback storage', fallbackStore.fallbackRequests, 200, {
          count: fallbackStore.fallbackRequests.length,
          total: fallbackStore.fallbackRequests.length,
          requests: fallbackStore.fallbackRequests
        });
      }
      if (fallbackStore && fallbackStore.fallbackListings) {
        return ApiResponse.success(res, 'Loaded from resilient fallback storage', fallbackStore.fallbackListings, 200, {
          count: fallbackStore.fallbackListings.length,
          total: fallbackStore.fallbackListings.length,
          listings: fallbackStore.fallbackListings
        });
      }
    }
    statusCode = 503;
    message = 'Database service is temporarily unavailable. Please retry shortly.';
    errorCode = 'DATABASE_UNAVAILABLE';
    return ApiResponse.error(res, message, statusCode, errors, errorCode);
  }

  // 3. Mongoose CastError (Invalid MongoDB ObjectId or datatype)
  if (err.name === 'CastError') {
    statusCode = 400;


    message = `Invalid format for field '${err.path || 'identifier'}': '${err.value}'.`;
    errorCode = 'INVALID_IDENTIFIER';
    return ApiResponse.error(res, message, statusCode, errors, errorCode);
  }

  // 4. Mongoose / Model Validation Errors
  if (err.name === 'ValidationError' && err.errors) {
    statusCode = 400;
    message = 'Request validation failed.';
    errorCode = 'VALIDATION_ERROR';
    errors = Object.values(err.errors).map(e => e.message || e.toString());
    return ApiResponse.error(res, message, statusCode, errors, errorCode);
  }

  // 5. MongoDB Duplicate Key Conflict (E11000 / E11001)
  if (err.code === 11000 || err.code === 11001) {
    statusCode = 409;
    const duplicatedField = err.keyValue ? Object.keys(err.keyValue)[0] : 'field';
    const duplicatedValue = err.keyValue ? err.keyValue[duplicatedField] : '';
    message = duplicatedValue 
      ? `A record with ${duplicatedField} '${duplicatedValue}' already exists.`
      : `A record with this ${duplicatedField} already exists.`;
    errorCode = 'DUPLICATE_RESOURCE';
    return ApiResponse.error(res, message, statusCode, errors, errorCode);
  }

  // 6. JWT Authentication & Token Errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid authentication token provided.';
    errorCode = 'INVALID_TOKEN';
    return ApiResponse.error(res, message, statusCode, errors, errorCode);
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Authentication token has expired. Please refresh your session or log in again.';
    errorCode = 'TOKEN_EXPIRED';
    return ApiResponse.error(res, message, statusCode, errors, errorCode);
  }

  if (err.name === 'NotBeforeError') {
    statusCode = 401;
    message = 'Authentication token is not active yet.';
    errorCode = 'TOKEN_INACTIVE';
    return ApiResponse.error(res, message, statusCode, errors, errorCode);
  }

  // 7. Multer & File Upload Errors
  if (err.name === 'MulterError') {
    statusCode = 400;
    errorCode = `UPLOAD_${err.code || 'ERROR'}`;
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'The uploaded file exceeds the maximum allowed size limit (10MB).';
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      message = `Unexpected upload field: '${err.field || 'file'}'.`;
    } else {
      message = `File upload error: ${err.message}`;
    }
    return ApiResponse.error(res, message, statusCode, errors, errorCode);
  }

  // 8. Custom AppError / HTTP Errors with defined status code
  if (err.statusCode || err.status) {
    statusCode = Number(err.statusCode || err.status);
    return ApiResponse.error(res, message, statusCode, errors, errorCode);
  }

  // 9. Unhandled 500 Server Errors
  statusCode = 500;
  if (!isDev) {
    message = 'An unexpected internal server error occurred. Please try again later.';
  }
  errorCode = errorCode || 'INTERNAL_SERVER_ERROR';

  return ApiResponse.error(res, message, statusCode, errors, errorCode);
}

// Attach AppError class to errorHandler export and support destructured imports
errorHandler.AppError = AppError;
errorHandler.errorHandler = errorHandler;

module.exports = errorHandler;
