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

export const logInfo = (message, meta = {}) => {
  logger.info(meta, message);
};

export const logWarn = (message, meta = {}) => {
  logger.warn(meta, message);
};

export const logError = (message, meta = {}) => {
  logger.error(meta, message);
};

export const logDebug = (message, meta = {}) => {
  logger.debug(meta, message);
};

export const childLogger = (bindings) => logger.child(bindings);

export default logger;

