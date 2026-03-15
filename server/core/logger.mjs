import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

// Allow different services (customer-api, admin-api, workers) to share the same logger core
const serviceName = process.env.SERVICE_NAME || 'replypilot-api';

const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  base: {
    service: serviceName,
    version: process.env.npm_package_version || '1.0.0',
  },
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
    bindings: () => ({}),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// PII / secret field scrubber
const SENSITIVE_KEYS = new Set([
  'password', 'password_hash', 'passwordHash', 'newPassword', 'currentPassword',
  'token', 'accessToken', 'access_token', 'refreshToken', 'refresh_token',
  'sessionToken', 'resetToken', 'password_reset_token',
  'apiKey', 'api_key', 'secret', 'authorization',
  'credit_card', 'creditCard', 'ssn', 'cardNumber',
]);

function scrubMeta(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const cleaned = Array.isArray(obj) ? [] : {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key)) {
      cleaned[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !(value instanceof Error)) {
      cleaned[key] = scrubMeta(value);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

export const logInfo = (message, meta = {}) => {
  logger.info(scrubMeta(meta), message);
};

export const logWarn = (message, meta = {}) => {
  logger.warn(scrubMeta(meta), message);
};

export const logError = (message, meta = {}) => {
  logger.error(scrubMeta(meta), message);
};

export const logDebug = (message, meta = {}) => {
  logger.debug(scrubMeta(meta), message);
};

export const childLogger = (bindings) => logger.child(bindings);

export default logger;

