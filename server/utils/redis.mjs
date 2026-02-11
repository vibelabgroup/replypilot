import Redis from 'ioredis';
import { logError, logDebug } from './logger.mjs';

// Default local Redis URL (matches docker-compose: password = changeme)
const DEFAULT_REDIS_URL =
  process.env.REDIS_URL || 'redis://:changeme@localhost:6379/0';

// Redis client for caching and rate limiting
const redis = new Redis(DEFAULT_REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on('error', (err) => {
  logError('Redis error', { error: err.message });
});

redis.on('connect', () => {
  logDebug('Redis connected');
});

// Cache helpers
export const cacheGet = async (key) => {
  try {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    logError('Cache get error', { key, error: error.message });
    return null;
  }
};

export const cacheSet = async (key, value, ttlSeconds = 3600) => {
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
    return true;
  } catch (error) {
    logError('Cache set error', { key, error: error.message });
    return false;
  }
};

export const cacheDelete = async (key) => {
  try {
    await redis.del(key);
    return true;
  } catch (error) {
    logError('Cache delete error', { key, error: error.message });
    return false;
  }
};

// Rate limiting helpers
export const rateLimitCheck = async (key, maxRequests, windowSeconds) => {
  try {
    const current = await redis.incr(key);
    
    if (current === 1) {
      await redis.expire(key, windowSeconds);
    }
    
    const ttl = await redis.ttl(key);
    
    return {
      allowed: current <= maxRequests,
      remaining: Math.max(0, maxRequests - current),
      resetTime: Date.now() + ttl * 1000,
    };
  } catch (error) {
    logError('Rate limit check error', { key, error: error.message });
    // Fail open in case of Redis error
    return { allowed: true, remaining: maxRequests, resetTime: Date.now() };
  }
};

// Queue helpers for job processing
export const enqueueJob = async (queue, job) => {
  try {
    await redis.lpush(queue, JSON.stringify(job));
    return true;
  } catch (error) {
    logError('Enqueue job error', { queue, error: error.message });
    return false;
  }
};

export const dequeueJob = async (queue, timeout = 5) => {
  try {
    const result = await redis.brpop(queue, timeout);
    return result ? JSON.parse(result[1]) : null;
  } catch (error) {
    logError('Dequeue job error', { queue, error: error.message });
    return null;
  }
};

// Pub/sub for real-time notifications
export const publish = async (channel, message) => {
  try {
    await redis.publish(channel, JSON.stringify(message));
    return true;
  } catch (error) {
    logError('Publish error', { channel, error: error.message });
    return false;
  }
};

export const subscribe = (channel, callback) => {
  const subscriber = new Redis(process.env.REDIS_URL);
  
  subscriber.subscribe(channel, (err) => {
    if (err) {
      logError('Subscribe error', { channel, error: err.message });
    }
  });
  
  subscriber.on('message', (ch, message) => {
    if (ch === channel) {
      try {
        callback(JSON.parse(message));
      } catch (error) {
        logError('Message parse error', { channel, error: error.message });
      }
    }
  });
  
  return subscriber;
};

export { redis };