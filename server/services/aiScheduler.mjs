import { enqueueJob } from '../utils/redis.mjs';
import { logDebug, logError } from '../utils/logger.mjs';

/**
 * Schedule (or reschedule) an AI response for a conversation.
 * Ensures we only have one \"authoritative\" pending AI job per conversation.
 *
 * This helper is intentionally small and side-effect free outside of:
 * - Updating the conversation row via the provided client (within caller's transaction)
 * - Enqueuing a job onto the ai_queue.
 *
 * @param {import('pg').PoolClient} client
 * @param {Object} params
 * @param {number} params.customerId
 * @param {number} params.conversationId
 * @param {number} params.latestMessageId
 * @param {string} params.latestMessageBody
 * @param {Object|null} aiSettingsRow
 */
export const scheduleConversationAIResponse = async (
  client,
  { customerId, conversationId, latestMessageId, latestMessageBody },
  aiSettingsRow
) => {
  try {
    if (!aiSettingsRow || aiSettingsRow.auto_response_enabled === false) {
      logDebug('AI auto-response disabled or no settings; skipping schedule', {
        customerId,
        conversationId,
      });
      return;
    }

    const now = Date.now();

    const debounceSeconds =
      typeof aiSettingsRow.debounce_window_seconds === 'number'
        ? aiSettingsRow.debounce_window_seconds
        : typeof aiSettingsRow.auto_response_delay_seconds === 'number'
        ? aiSettingsRow.auto_response_delay_seconds
        : 0;

    const delayMs = Math.max(0, debounceSeconds * 1000);
    const scheduledFor = now + delayMs;

    // Generate a simple, monotonic-ish job id.
    const aiJobId = BigInt(scheduledFor);

    // Persist scheduling metadata on the conversation within the current transaction.
    await client.query(
      `
        UPDATE conversations
        SET
          pending_ai_job_id = $1,
          ai_debounce_until = to_timestamp($2 / 1000.0),
          updated_at = NOW()
        WHERE id = $3
      `,
      [aiJobId.toString(), scheduledFor, conversationId]
    );

    const job = {
      type: 'ai_generate',
      customerId,
      conversationId,
      // Keep original body around in case we need it as a fallback.
      leadMessage: latestMessageBody,
      latestInboundMessageId: latestMessageId,
      aiJobId: aiJobId.toString(),
      delayMs,
      scheduledFor,
      createdAt: now,
    };

    await enqueueJob('ai_queue', job);

    logDebug('AI conversation job scheduled', {
      customerId,
      conversationId,
      aiJobId: aiJobId.toString(),
      delayMs,
      scheduledFor,
    });
  } catch (error) {
    logError('Failed to schedule AI conversation response', {
      customerId,
      conversationId,
      error: error?.message,
    });
  }
};

