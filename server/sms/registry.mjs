// Simple in-memory registry for SMS providers

/**
 * @typedef {import('./contract.mjs').SmsProvider} SmsProvider
 */

/** @type {Map<string, SmsProvider>} */
const providers = new Map();

/**
 * Register an SMS provider implementation.
 *
 * @param {string} id
 * @param {SmsProvider} provider
 */
export const registerProvider = (id, provider) => {
  if (!id) {
    throw new Error('Provider id is required');
  }
  if (!provider) {
    throw new Error(`Provider implementation for "${id}" is required`);
  }
  providers.set(id, provider);
};

/**
 * Get a provider by id.
 *
 * @param {string} id
 * @returns {SmsProvider | undefined}
 */
export const getProvider = (id) => {
  return providers.get(id);
};

/**
 * List registered provider ids.
 *
 * @returns {string[]}
 */
export const listProviders = () => {
  return Array.from(providers.keys());
};

