const rateLimit = require('express-rate-limit');
const config = require('../config');
const logger = require('./logger');

const createRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: config.security.rateLimitRpm,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: '1 minute'
    });
  },
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/api/health';
  }
});

module.exports = createRateLimit;