import rateLimit from 'express-rate-limit';
import { rateLimitCheck } from '../utils/redis.mjs';
import { logWarn } from '../utils/logger.mjs';

const isTest = process.env.NODE_ENV === 'test';
const isProd = process.env.NODE_ENV === 'production';

// Standard API rate limiter (per IP)
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: {
    success: false,
    error: {
      message: 'Too many requests, please try again later',
      statusCode: 429,
    },
  },
  handler: (req, res, next, options) => {
    logWarn('Rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method,
    });
    res.status(429).json(options.message);
  },
});

// Strict rate limiter for auth endpoints
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login attempts per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  // In local/dev we disable auth rate limiting entirely so flows
  // like checkout → signup → onboarding can be tested freely.
  // In production we still enforce the limit.
  skip: () => isTest || !isProd,
  message: {
    success: false,
    error: {
      message: 'Too many authentication attempts, please try again later',
      statusCode: 429,
    },
  },
  handler: (req, res, next, options) => {
    logWarn('Auth rate limit exceeded', {
      ip: req.ip,
      email: req.body.email,
    });
    res.status(429).json(options.message);
  },
});

// Webhook rate limiter (higher limit, separate window)
export const webhookRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute for webhooks
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: {
    success: false,
    error: {
      message: 'Too many webhook requests',
      statusCode: 429,
    },
  },
});

// Per-user rate limiter using Redis (for authenticated requests)
export const userRateLimiter = (maxRequests = 100, windowSeconds = 60) => {
  return async (req, res, next) => {
    if (isTest) {
      return next();
    }
    if (!req.auth?.userId) {
      return next();
    }

    const key = `rate_limit:user:${req.auth.userId}:${req.path}`;
    const result = await rateLimitCheck(key, maxRequests, windowSeconds);

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', result.resetTime);

    if (!result.allowed) {
      logWarn('User rate limit exceeded', {
        userId: req.auth.userId,
        customerId: req.auth.customerId,
        path: req.path,
      });
      return res.status(429).json({
        success: false,
        error: {
          message: 'Too many requests for this user',
          statusCode: 429,
          retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
        },
      });
    }

    next();
  };
};

// AI generation rate limiter (stricter)
export const aiRateLimiter = async (req, res, next) => {
  if (isTest) {
    return next();
  }
  if (!req.auth?.customerId) {
    return next();
  }

  const key = `rate_limit:ai:${req.auth.customerId}`;
  const result = await rateLimitCheck(key, 50, 3600); // 50 AI calls per hour

  if (!result.allowed) {
    logWarn('AI rate limit exceeded', {
      customerId: req.auth.customerId,
    });
    return res.status(429).json({
      success: false,
      error: {
        message: 'AI generation limit reached for this hour',
        statusCode: 429,
        retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
      },
    });
  }

  next();
};

// SMS sending rate limiter
export const smsRateLimiter = async (req, res, next) => {
  if (isTest) {
    return next();
  }
  if (!req.auth?.customerId) {
    return next();
  }

  const key = `rate_limit:sms:${req.auth.customerId}`;
  const result = await rateLimitCheck(key, 100, 3600); // 100 SMS per hour

  if (!result.allowed) {
    logWarn('SMS rate limit exceeded', {
      customerId: req.auth.customerId,
    });
    return res.status(429).json({
      success: false,
      error: {
        message: 'SMS sending limit reached for this hour',
        statusCode: 429,
      },
    });
  }

  next();
};