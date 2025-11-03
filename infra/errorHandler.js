const logger = require('./logger');
const metrics = require('./metrics');

const errorHandler = (err, req, res, next) => {
  logger.error('Error occurred:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Record error metric
  metrics.recordError(err.name || 'UnknownError', req.route?.path || req.path);

  // Determine error type and response
  let statusCode = 500;
  let errorCode = 'INTERNAL_SERVER_ERROR';
  let message = 'An internal server error occurred';

  if (err.name === 'ValidationError') {
    statusCode = 400;
    errorCode = 'INVALID_INPUT';
    message = err.message;
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    errorCode = 'UNAUTHORIZED';
    message = 'Authentication required';
  } else if (err.name === 'ForbiddenError') {
    statusCode = 403;
    errorCode = 'FORBIDDEN';
    message = 'Access denied';
  } else if (err.name === 'NotFoundError') {
    statusCode = 404;
    errorCode = 'NOT_FOUND';
    message = 'Resource not found';
  } else if (err.name === 'TimeoutError') {
    statusCode = 408;
    errorCode = 'TIMEOUT';
    message = 'Request timeout';
  } else if (err.name === 'RateLimitError') {
    statusCode = 429;
    errorCode = 'RATE_LIMIT_EXCEEDED';
    message = 'Rate limit exceeded';
  } else if (err.name === 'UpstreamError') {
    statusCode = 502;
    errorCode = 'UPSTREAM_UNAVAILABLE';
    message = 'External service unavailable';
  } else if (err.name === 'RerankError') {
    statusCode = 500;
    errorCode = 'RERANK_FAILED';
    message = 'Reranking service failed';
  }

  // Generate trace ID for error tracking
  const traceId = require('crypto').randomUUID();

  const errorResponse = {
    error: {
      code: errorCode,
      message: message,
      traceId: traceId
    }
  };

  // Add details in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error.details = err.message;
    errorResponse.error.stack = err.stack;
  }

  res.status(statusCode).json(errorResponse);
};

// Custom error classes
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

class UnauthorizedError extends Error {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

class ForbiddenError extends Error {
  constructor(message = 'Access denied') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

class NotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

class TimeoutError extends Error {
  constructor(message = 'Request timeout') {
    super(message);
    this.name = 'TimeoutError';
  }
}

class UpstreamError extends Error {
  constructor(message = 'External service unavailable') {
    super(message);
    this.name = 'UpstreamError';
  }
}

class RerankError extends Error {
  constructor(message = 'Reranking service failed') {
    super(message);
    this.name = 'RerankError';
  }
}

module.exports = {
  errorHandler,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  TimeoutError,
  UpstreamError,
  RerankError
};