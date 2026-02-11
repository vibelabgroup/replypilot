import { logError, logWarn } from '../utils/logger.mjs';

class AppError extends Error {
  constructor(message, statusCode = 500, errors = []) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.message = err.message || 'Internal Server Error';

  // Log error
  if (err.statusCode >= 500) {
    logError(err.message, {
      statusCode: err.statusCode,
      path: req.path,
      method: req.method,
      error: err.message,
      stack: err.stack,
      userId: req.auth?.userId,
      customerId: req.auth?.customerId,
    });
  } else if (err.statusCode >= 400) {
    logWarn(err.message, {
      statusCode: err.statusCode,
      path: req.path,
      method: req.method,
      userId: req.auth?.userId,
    });
  }

  // Send to Sentry if configured
  if (process.env.SENTRY_DSN && err.statusCode >= 500) {
    // Sentry will capture via Express integration
  }

  // Response
  const response = {
    success: false,
    error: {
      // In this project we prefer to always surface the real
      // error message to make debugging deployments easier.
      // If you later want stricter production behaviour, you
      // can swap this back to a generic message.
      message: err.message,
      statusCode: err.statusCode,
    },
  };

  // Include validation errors
  if (err.errors && err.errors.length > 0) {
    response.error.errors = err.errors;
  }

  // Include stack in development
  if (process.env.NODE_ENV === 'development') {
    response.error.stack = err.stack;
  }

  res.status(err.statusCode).json(response);
};

// Async handler wrapper
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Common error creators
export const createError = (message, statusCode = 500) => {
  return new AppError(message, statusCode);
};

export const createNotFoundError = (resource = 'Resource') => {
  return new AppError(`${resource} not found`, 404);
};

export const createUnauthorizedError = (message = 'Unauthorized') => {
  return new AppError(message, 401);
};

export const createForbiddenError = (message = 'Forbidden') => {
  return new AppError(message, 403);
};

export const createValidationError = (message, errors = []) => {
  const error = new AppError(message, 400, errors);
  return error;
};

export { AppError };