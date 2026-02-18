import Twilio from 'twilio';
import { query, withTransaction } from '../utils/db.mjs';
import { logInfo, logError, logDebug } from '../utils/logger.mjs';
import { enqueueJob } from '../utils/redis.mjs';

const twilioClient = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID;

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// Sleep helper
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Send SMS with retry logic
export const sendSMS = async (to, body, from = null, options = {}) => {
  const { conversationId, messageId } = options;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logDebug('Sending SMS', { to, attempt, messageId });

      const messageParams = {
        to,
        body,
        messagingServiceSid: MESSAGING_SERVICE_SID,
      };

      if (from) {
        messageParams.from = from;
      }

      const message = await twilioClient.messages.create(messageParams);

      logInfo('SMS sent successfully', {
        sid: message.sid,
        to,
        status: message.status,
        messageId,
      });

      // Update message record if we have an ID
      if (messageId) {
        await query(
          `UPDATE messages
           SET twilio_message_sid = $1,
               delivery_status = 'sent',
               twilio_status = $2,
               sent_at = NOW()
           WHERE id = $3`,
          [message.sid, message.status, messageId]
        );
      }

      return {
        success: true,
        sid: message.sid,
        status: message.status,
      };
    } catch (error) {
      logError('SMS send failed', {
        attempt,
        to,
        error: error.message,
        code: error.code,
        messageId,
      });

      if (attempt === MAX_RETRIES) {
        // Final failure
        if (messageId) {
          await query(
            `UPDATE messages
             SET delivery_status = 'failed',
                 delivery_error = $1,
                 failed_at = NOW()
             WHERE id = $2`,
            [error.message, messageId]
          );
        }

        return {
          success: false,
          error: error.message,
          code: error.code,
        };
      }

      // Exponential backoff
      await sleep(RETRY_DELAY_MS * Math.pow(2, attempt - 1));
    }
  }
};

// Queue SMS for async sending
export const queueSMS = async (customerId, to, body, options = {}) => {
  const job = {
    type: 'sms_send',
    customerId,
    to,
    body,
    options,
    createdAt: Date.now(),
  };

  await enqueueJob('sms_queue', job);
  logDebug('SMS queued', { customerId, to, jobId: job.createdAt });
  
  return { queued: true };
};

// Handle incoming SMS webhook
export const handleIncomingSMS = async (payload) => {
  const {
    From,
    To,
    Body,
    MessageSid,
    FromCity,
    FromState,
    FromZip,
    FromCountry,
  } = payload;

  logInfo('Incoming SMS received', {
    from: From,
    to: To,
    messageSid: MessageSid,
  });

  return await withTransaction(async (client) => {
    // Find customer by Twilio number
    const twilioNumberResult = await client.query(
      `SELECT id, customer_id FROM twilio_numbers WHERE phone_number = $1 AND is_active = true`,
      [To]
    );

    if (twilioNumberResult.rowCount === 0) {
      logError('No customer found for phone number', { phoneNumber: To });
      throw new Error('Phone number not registered');
    }

    const twilioNumber = twilioNumberResult.rows[0];
    const customerId = twilioNumber.customer_id;
    const twilioNumberId = twilioNumber.id;

    // Find or create conversation
    let conversationResult = await client.query(
      `SELECT id FROM conversations
       WHERE customer_id = $1 AND lead_phone = $2 AND status = 'active'
       ORDER BY last_message_at DESC
       LIMIT 1`,
      [customerId, From]
    );

    let conversationId;

    if (conversationResult.rowCount === 0) {
      // Create new conversation
      const newConversation = await client.query(
        `INSERT INTO conversations (customer_id, twilio_number_id, lead_phone, lead_source)
         VALUES ($1, $2, $3, 'sms')
         RETURNING id`,
        [customerId, twilioNumberId, From]
      );
      conversationId = newConversation.rows[0].id;

      // Create lead
      await client.query(
        `INSERT INTO leads (customer_id, conversation_id, phone, source)
         VALUES ($1, $2, $3, 'sms')`,
        [customerId, conversationId, From]
      );

      // Queue notification for new lead
      await queueNotification(customerId, 'new_lead', {
        conversationId,
        leadPhone: From,
        message: Body,
      });
    } else {
      conversationId = conversationResult.rows[0].id;
    }

    // Store incoming message
    const messageResult = await client.query(
      `INSERT INTO messages (conversation_id, direction, sender, content, twilio_message_sid)
       VALUES ($1, 'inbound', 'lead', $2, $3)
       RETURNING id`,
      [conversationId, Body, MessageSid]
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
        leadMessage: Body,
        delayMs: aiSettings.rows[0].auto_response_delay_seconds * 1000,
      });
    }

    // Queue notification
    await queueNotification(customerId, 'new_message', {
      conversationId,
      messageId,
      leadPhone: From,
      message: Body,
    });

    return {
      success: true,
      conversationId,
      messageId,
    };
  });
};

// Provision new Twilio number
export const provisionNumber = async (customerId, areaCode = null) => {
  try {
    logInfo('Provisioning Twilio number', { customerId, areaCode });

    // Search for available Danish MOBILE numbers.
    // We prefer true mobile numbers so GSM divert codes work reliably.
    const searchParams = {
      limit: 1,
      smsEnabled: true,
      voiceEnabled: true,
      mmsEnabled: false,
    };

    if (areaCode) {
      searchParams.areaCode = areaCode;
    }

    const availableNumbers = await twilioClient
      .availablePhoneNumbers('DK')
      .mobile.list(searchParams);

    if (availableNumbers.length === 0) {
      throw new Error('No phone numbers available');
    }

    const phoneNumber = availableNumbers[0].phoneNumber;

    // Purchase number
    const incomingPhoneNumber = await twilioClient.incomingPhoneNumbers.create({
      phoneNumber,
      messagingServiceSid: MESSAGING_SERVICE_SID,
      smsUrl: `${process.env.FRONTEND_URL}/webhook/twilio`,
      smsMethod: 'POST',
    });

    // Store in database
    await query(
      `INSERT INTO twilio_numbers (customer_id, phone_number, twilio_sid, twilio_friendly_name, monthly_cost)
       VALUES ($1, $2, $3, $4, $5)`,
      [customerId, phoneNumber, incomingPhoneNumber.sid, incomingPhoneNumber.friendlyName, 2.00]
    );

    logInfo('Twilio number provisioned', {
      customerId,
      phoneNumber,
      sid: incomingPhoneNumber.sid,
    });

    return {
      success: true,
      phoneNumber,
      sid: incomingPhoneNumber.sid,
    };
  } catch (error) {
    logError('Failed to provision Twilio number', {
      customerId,
      error: error.message,
    });
    throw error;
  }
};

// Release Twilio number
export const releaseNumber = async (customerId, phoneNumber) => {
  const result = await query(
    `SELECT id, twilio_sid FROM twilio_numbers
     WHERE customer_id = $1 AND phone_number = $2 AND is_active = true`,
    [customerId, phoneNumber]
  );

  if (result.rowCount === 0) {
    throw new Error('Phone number not found or already released');
  }

  const { id, twilio_sid } = result.rows[0];

  try {
    await twilioClient.incomingPhoneNumbers(twilio_sid).remove();
  } catch (error) {
    logError('Failed to release Twilio number from Twilio', {
      customerId,
      phoneNumber,
      error: error.message,
    });
    // Continue to mark as released in DB
  }

  await query(
    `UPDATE twilio_numbers
     SET is_active = false,
         released_at = NOW()
     WHERE id = $1`,
    [id]
  );

  logInfo('Twilio number released', { customerId, phoneNumber });

  return { success: true };
};

// Verify Twilio webhook signature
export const verifyWebhookSignature = (url, body, signature) => {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  return Twilio.validateRequest(authToken, signature, url, body);
};

// Helper to queue notifications
const queueNotification = async (customerId, type, payload) => {
  await enqueueJob('notification_queue', {
    type: 'notification_send',
    customerId,
    notificationType: type,
    payload,
    createdAt: Date.now(),
  });
};