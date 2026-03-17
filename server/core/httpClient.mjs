// HTTP Client with connection pooling and retry logic
import { logError, logWarn } from './logger.mjs';

class HTTPClient {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.baseDelay = options.baseDelay || 1000;
    this.maxDelay = options.maxDelay || 10000;
    this.timeout = options.timeout || 30000;
  }

  // Exponential backoff with jitter
  getDelay(retryCount) {
    const exponentialDelay = Math.min(this.baseDelay * Math.pow(2, retryCount), this.maxDelay);
    const jitter = Math.random() * 0.3 * exponentialDelay; // 30% jitter
    return exponentialDelay + jitter;
  }

  async fetch(url, options = {}) {
    const maxRetries = options.retries !== undefined ? options.retries : this.maxRetries;
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Don't retry on client errors (4xx)
        if (response.status >= 400 && response.status < 500) {
          return response;
        }

        // Return successful response
        if (response.ok) {
          return response;
        }

        // Server error, prepare for retry
        lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
        
      } catch (error) {
        clearTimeout(timeoutId);
        lastError = error;

        // Don't retry on abort errors
        if (error.name === 'AbortError') {
          throw new Error(`Request timeout (${this.timeout}ms)`);
        }

        // Don't retry on certain errors
        if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
          throw error;
        }
      }

      // If this is the last attempt, throw the error
      if (attempt === maxRetries) {
        throw lastError;
      }

      // Wait before retry
      const delay = this.getDelay(attempt);
      logWarn(`HTTP request failed, retrying in ${Math.round(delay)}ms`, { 
        url: url.replace(/https?:\/\/[^@]+@/, 'https://***@'), // Hide credentials
        attempt: attempt + 1,
        maxRetries: maxRetries + 1,
        error: lastError.message 
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    throw lastError;
  }
}

// Create singleton instances for different use cases
export const emailClient = new HTTPClient({
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 8000,
  timeout: 30000,
});

export const oauthClient = new HTTPClient({
  maxRetries: 2,
  baseDelay: 500,
  maxDelay: 5000,
  timeout: 20000,
});

export const shopifyClient = new HTTPClient({
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  timeout: 45000,
});

export const wooClient = new HTTPClient({
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  timeout: 30000,
});

// Default client for general use
export const httpClient = new HTTPClient({
  maxRetries: 2,
  baseDelay: 1000,
  maxDelay: 5000,
  timeout: 15000,
});
