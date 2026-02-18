import { enqueueJob } from '../utils/redis.mjs';
import { logInfo, logError } from '../utils/logger.mjs';

/**
 * Apply normalized inbound SMS message into the domain model:
 * - find or create conversation
 * - create lead if needed
 * - insert message
 * - update conversation metadata
 * - queue AI response and notifications
 *
 * This function is provider-agnostic; providers should normalize their
 * payloads before calling it.
 *
 * @param {import('pg').PoolClient} client
 * @param {Object} params
 * @param {string} params.customerId
 * @param {string} params.from
 * @param {string} params.to
 * @param {string} params.body
 * @param {string} [params.providerMessageId]
 * @param {string} [params.twilioNumberId]
 * @returns {Promise<{success: boolean, conversationId: string, messageId: string}>}
 */
export const applyInboundMessage = async (
  client,
  { customerId, from, to, body, providerMessageId, twilioNumberId = null }
) => {
  logInfo('Applying inbound SMS message', {
    customerId,
    from,
    to,
    providerMessageId,
  });

  // Find or create conversation
  let conversationResult = await client.query(
    `SELECT id FROM conversations
     WHERE customer_id = $1 AND lead_phone = $2 AND status = 'active'
     ORDER BY last_message_at DESC
     LIMIT 1`,
    [customerId, from]
  );

  let conversationId;

  if (conversationResult.rowCount === 0) {
    // Create new conversation
    const newConversation = await client.query(
      `INSERT INTO conversations (customer_id, twilio_number_id, lead_phone, lead_source)
       VALUES ($1, $2, $3, 'sms')
       RETURNING id`,
      [customerId, twilioNumberId, from]
    );
    conversationId = newConversation.rows[0].id;

    // Create lead
    await client.query(
      `INSERT INTO leads (customer_id, conversation_id, phone, source)
       VALUES ($1, $2, $3, 'sms')`,
      [customerId, conversationId, from]
    );

    // Queue notification for new lead
    await queueNotification(customerId, 'new_lead', {
      conversationId,
      leadPhone: from,
      message: body,
    });
  } else {
    conversationId = conversationResult.rows[0].id;
  }

  // Store incoming message
  const messageResult = await client.query(
    `INSERT INTO messages (conversation_id, direction, sender, content, twilio_message_sid)
     VALUES ($1, 'inbound', 'lead', $2, $3)
     RETURNING id`,
    [conversationId, body, providerMessageId]
  );
  const messageId = messageResult.rows[0].id;

  // Update conversation
  await client.query(
    `UPDATE conversations
     SET last_message_at = NOW(),
         message_count = message_count + 1,
         updated_at = NOW()
     WHERE id = $1`,
    [conversationId]
  );

  // Queue AI response if auto-response is enabled
  const aiSettings = await client.query(
    `SELECT auto_response_enabled, auto_response_delay_seconds
     FROM ai_settings
     WHERE customer_id = $1`,
    [customerId]
  );

  if (aiSettings.rowCount > 0 && aiSettings.rows[0].auto_response_enabled) {
    await enqueueJob('ai_queue', {
      type: 'ai_generate',
      customerId,
      conversationId,
      messageId,
      leadMessage: body,
      delayMs: aiSettings.rows[0].auto_response_delay_seconds * 1000,
    });
  }

  // Queue notification
  await queueNotification(customerId, 'new_message', {
    conversationId,
    messageId,
    leadPhone: from,
    message: body,
  });

  return {
    success: true,
    conversationId,
    messageId,
  };
};

// Helper to queue notifications
const queueNotification = async (customerId, type, payload) => {
  try {
    await enqueueJob('notification_queue', {
      type: 'notification_send',
      customerId,
      notificationType: type,
      payload,
      createdAt: Date.now(),
    });
  } catch (err) {
    logError('Failed to queue notification from inbound SMS', {
      customerId,
      type,
      error: err?.message,
    });
  }
};

