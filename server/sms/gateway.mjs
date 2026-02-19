import { query } from '../utils/db.mjs';
import { enqueueJob } from '../utils/redis.mjs';
import { logInfo, logError, logDebug } from '../utils/logger.mjs';
import { registerProvider, getProvider } from './registry.mjs';
import twilioProvider from './providers/twilio.mjs';
import fonecloudProvider from './providers/fonecloud.mjs';

// Bootstrap default providers
registerProvider('twilio', twilioProvider);
registerProvider('fonecloud', fonecloudProvider);

const DEFAULT_PROVIDER = 'twilio';

const getProviderIdForCustomer = async (customerId) => {
  if (!customerId) {
    return DEFAULT_PROVIDER;
  }

  try {
    const result = await query(
      `SELECT sms_provider FROM customers WHERE id = $1`,
      [customerId]
    );

    const providerId = result.rows[0]?.sms_provider || DEFAULT_PROVIDER;
    return providerId;
  } catch (err) {
    logError('Failed to resolve SMS provider for customer', {
      customerId,
      error: err?.message,
    });
    return DEFAULT_PROVIDER;
  }
};

const requireProvider = (providerId) => {
  const provider = getProvider(providerId);
  if (!provider) {
    throw new Error(`SMS provider "${providerId}" is not registered`);
  }
  return provider;
};

/**
 * Resolve the "from" number/sender for a customer for outbound SMS.
 * Returns allocated Fonecloud number, or Twilio number, or for Fonecloud fallback the fonecloud_sender_id.
 * @param {string} customerId
 * @returns {Promise<string|null>}
 */
export const getFromNumberForCustomer = async (customerId) => {
  if (!customerId) return null;
  try {
    const result = await query(
      `SELECT c.sms_provider, c.fonecloud_sender_id, c.fonecloud_number_id,
              fn.phone_number AS fonecloud_phone_number,
              (SELECT tn.phone_number FROM twilio_numbers tn WHERE tn.customer_id = c.id AND tn.is_active = true LIMIT 1) AS twilio_phone_number
       FROM customers c
       LEFT JOIN fonecloud_numbers fn ON c.fonecloud_number_id = fn.id AND fn.is_active = true
       WHERE c.id = $1 LIMIT 1`,
      [customerId]
    );
    const row = result.rows[0];
    if (!row) return null;
    if (row.sms_provider === 'fonecloud') {
      if (row.fonecloud_phone_number) return row.fonecloud_phone_number;
      return row.fonecloud_sender_id || null;
    }
    return row.twilio_phone_number || null;
  } catch (err) {
    logError('getFromNumberForCustomer failed', { customerId, error: err?.message });
    return null;
  }
};

/**
 * Send SMS through the appropriate provider for the customer.
 *
 * @param {Object} params
 * @param {string} params.customerId
 * @param {string} params.to
 * @param {string} params.body
 * @param {string} [params.from]
 * @param {Object} [params.options]
 */
export const sendSms = async ({
  customerId,
  to,
  body,
  from,
  options = {},
}) => {
  const providerId = await getProviderIdForCustomer(customerId);
  const provider = requireProvider(providerId);

  let fromNumber = from;
  if (!fromNumber) {
    fromNumber = await getFromNumberForCustomer(customerId);
  }

  logDebug('Sending SMS via provider', {
    provider: providerId,
    customerId,
    to,
  });

  const result = await provider.send({ to, body, from: fromNumber, options });

  logInfo('SMS send result', {
    provider: providerId,
    customerId,
    to,
    success: result.success,
    providerMessageId: result.providerMessageId,
  });

  return result;
};

/**
 * Queue SMS for async sending via workers.
 *
 * @param {Object} params
 * @param {string} params.customerId
 * @param {string} params.to
 * @param {string} params.body
 * @param {string} [params.from]
 * @param {Object} [params.options]
 */
export const queueSms = async ({
  customerId,
  to,
  body,
  from,
  options = {},
}) => {
  const job = {
    type: 'sms_send',
    customerId,
    to,
    body,
    options: { ...options, from },
    createdAt: Date.now(),
  };

  await enqueueJob('sms_queue', job);
  logDebug('SMS queued via gateway', {
    customerId,
    to,
    jobId: job.createdAt,
  });

  return { queued: true };
};

/**
 * Handle inbound webhook from a specific provider.
 *
 * @param {string} providerId
 * @param {any} payload
 */
export const handleIncomingMessage = async (providerId, payload) => {
  const provider = requireProvider(providerId || DEFAULT_PROVIDER);
  return provider.handleIncoming(payload);
};

/**
 * Provision a new number via the correct provider.
 */
export const provisionNumber = async ({
  customerId,
  regionOrAreaCode,
}) => {
  const providerId = await getProviderIdForCustomer(customerId);
  const provider = requireProvider(providerId);
  return provider.provisionNumber({ customerId, regionOrAreaCode });
};

/**
 * Release a number via the correct provider.
 */
export const releaseNumber = async ({ customerId, phoneNumber }) => {
  const providerId = await getProviderIdForCustomer(customerId);
  const provider = requireProvider(providerId);
  return provider.releaseNumber({ customerId, phoneNumber });
};

/**
 * Verify webhook signature for a given provider.
 */
export const verifyWebhookSignature = (providerId, { url, body, signature }) => {
  const provider = requireProvider(providerId || DEFAULT_PROVIDER);
  return provider.verifyWebhookSignature({ url, body, signature });
};

