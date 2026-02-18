import {
  sendSMS,
  handleIncomingSMS,
  provisionNumber as twilioProvisionNumber,
  releaseNumber as twilioReleaseNumber,
  verifyWebhookSignature as twilioVerifyWebhookSignature,
} from '../../services/twilioService.mjs';
import { createSmsProvider } from '../contract.mjs';

export const twilioProvider = createSmsProvider({
  async send({ to, body, from, options = {} }) {
    const result = await sendSMS(to, body, from ?? null, options);

    if (result.success) {
      return {
        success: true,
        providerMessageId: result.sid,
        status: result.status,
      };
    }

    return {
      success: false,
      error: result.error,
      code: result.code,
    };
  },

  async handleIncoming(payload) {
    // Delegate to existing Twilio handler which already performs
    // all DB updates and business logic.
    const result = await handleIncomingSMS(payload);
    return {
      success: !!result?.success,
      conversationId: result?.conversationId,
      messageId: result?.messageId,
      error: result?.error,
    };
  },

  async provisionNumber({ customerId, regionOrAreaCode }) {
    const result = await twilioProvisionNumber(customerId, regionOrAreaCode);
    if (result.success) {
      return {
        success: true,
        phoneNumber: result.phoneNumber,
        sid: result.sid,
      };
    }
    return {
      success: false,
      error: result.error,
    };
  },

  async releaseNumber({ customerId, phoneNumber }) {
    try {
      await twilioReleaseNumber(customerId, phoneNumber);
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err?.message || 'Failed to release number',
      };
    }
  },

  verifyWebhookSignature({ url, body, signature }) {
    return twilioVerifyWebhookSignature(url, body, signature);
  },
});

export default twilioProvider;

