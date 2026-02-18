// SMS provider contract and shared result types

/**
 * @typedef {Object} SendOptions
 * @property {string} [conversationId]
 * @property {string} [messageId]
 * @property {Object} [metadata]
 */

/**
 * @typedef {Object} SendParams
 * @property {string} to
 * @property {string} body
 * @property {string} [from]
 * @property {SendOptions} [options]
 */

/**
 * @typedef {Object} SendResult
 * @property {boolean} success
 * @property {string} [providerMessageId]
 * @property {string} [status]
 * @property {string} [error]
 * @property {string|number} [code]
 */

/**
 * @typedef {Object} InboundResult
 * @property {boolean} success
 * @property {string} [conversationId]
 * @property {string} [messageId]
 * @property {string} [error]
 */

/**
 * @typedef {Object} ProvisionParams
 * @property {string} customerId
 * @property {string} [regionOrAreaCode]
 */

/**
 * @typedef {Object} ProvisionResult
 * @property {boolean} success
 * @property {string} [phoneNumber]
 * @property {string} [sid]
 * @property {string} [error]
 */

/**
 * @typedef {Object} ReleaseParams
 * @property {string} customerId
 * @property {string} phoneNumber
 */

/**
 * @typedef {Object} ReleaseResult
 * @property {boolean} success
 * @property {string} [error]
 */

/**
 * @typedef {Object} VerifyWebhookParams
 * @property {string} url
 * @property {Object|string} body
 * @property {string} signature
 */

/**
 * @typedef {Object} SmsProvider
 * @property {(params: SendParams) => Promise<SendResult>} send
 * @property {(payload: any) => Promise<InboundResult>} handleIncoming
 * @property {(params: ProvisionParams) => Promise<ProvisionResult>} provisionNumber
 * @property {(params: ReleaseParams) => Promise<ReleaseResult>} releaseNumber
 * @property {(params: VerifyWebhookParams) => boolean} verifyWebhookSignature
 */

/**
 * Helper to create a provider with basic shape checking in one place.
 *
 * @param {SmsProvider} impl
 * @returns {SmsProvider}
 */
export const createSmsProvider = (impl) => {
  if (!impl || typeof impl.send !== 'function') {
    throw new Error('SmsProvider must implement send()');
  }
  if (typeof impl.handleIncoming !== 'function') {
    throw new Error('SmsProvider must implement handleIncoming()');
  }
  if (typeof impl.provisionNumber !== 'function') {
    throw new Error('SmsProvider must implement provisionNumber()');
  }
  if (typeof impl.releaseNumber !== 'function') {
    throw new Error('SmsProvider must implement releaseNumber()');
  }
  if (typeof impl.verifyWebhookSignature !== 'function') {
    throw new Error('SmsProvider must implement verifyWebhookSignature()');
  }
  return impl;
};

