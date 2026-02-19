import { query, withTransaction } from '../utils/db.mjs';
import { logInfo, logError, logDebug } from '../utils/logger.mjs';
import { queueSms } from '../sms/gateway.mjs';
import { generateResponse, queueAIResponse } from './aiService.mjs';

// Get conversations for customer
export const getConversations = async (customerId, options = {}) => {
  const { status, limit = 20, offset = 0, search } = options;

  let whereClause = 'WHERE c.customer_id = $1';
  const params = [customerId];
  let paramCount = 1;

  if (status) {
    paramCount++;
    whereClause += ` AND c.status = $${paramCount}`;
    params.push(status);
  }

  if (search) {
    paramCount++;
    whereClause += ` AND (c.lead_name ILIKE $${paramCount} OR c.lead_phone ILIKE $${paramCount})`;
    params.push(`%${search}%`);
  }

  params.push(limit, offset);

  const result = await query(
    `SELECT c.*, 
            tn.phone_number as twilio_number,
            fn.phone_number as fonecloud_number,
            COALESCE(tn.phone_number, fn.phone_number) as reply_number,
            (SELECT content FROM messages WHERE conversation_id = c.id AND direction = 'inbound' ORDER BY created_at DESC LIMIT 1) as last_inbound_message,
            (SELECT content FROM messages WHERE conversation_id = c.id AND sender = 'ai' ORDER BY created_at DESC LIMIT 1) as last_ai_response
     FROM conversations c
     LEFT JOIN twilio_numbers tn ON c.twilio_number_id = tn.id
     LEFT JOIN fonecloud_numbers fn ON c.fonecloud_number_id = fn.id
     ${whereClause}
     ORDER BY c.last_message_at DESC NULLS LAST
     LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
    params
  );

  // Get total count
  const countResult = await query(
    `SELECT COUNT(*) FROM conversations c ${whereClause}`,
    params.slice(0, -2)
  );

  return {
    conversations: result.rows,
    total: parseInt(countResult.rows[0].count),
    limit,
    offset,
  };
};

// Get single conversation with messages
export const getConversation = async (customerId, conversationId) => {
  const conversationResult = await query(
    `SELECT c.*, tn.phone_number as twilio_number, fn.phone_number as fonecloud_number,
            COALESCE(tn.phone_number, fn.phone_number) as reply_number
     FROM conversations c
     LEFT JOIN twilio_numbers tn ON c.twilio_number_id = tn.id
     LEFT JOIN fonecloud_numbers fn ON c.fonecloud_number_id = fn.id
     WHERE c.id = $1 AND c.customer_id = $2`,
    [conversationId, customerId]
  );

  if (conversationResult.rowCount === 0) {
    return null;
  }

  const messagesResult = await query(
    `SELECT m.*, 
            (SELECT COUNT(*) FROM messages WHERE conversation_id = m.conversation_id AND sender = 'ai') as ai_count
     FROM messages m
     WHERE m.conversation_id = $1
     ORDER BY m.created_at ASC`,
    [conversationId]
  );

  return {
    ...conversationResult.rows[0],
    messages: messagesResult.rows,
  };
};

// Create new conversation
export const createConversation = async (customerId, data) => {
  const { leadName, leadPhone, leadEmail } = data;

  return await withTransaction(async (client) => {
    const providerResult = await client.query(
      `SELECT sms_provider, fonecloud_number_id FROM customers WHERE id = $1 LIMIT 1`,
      [customerId]
    );
    const provider = providerResult.rows[0]?.sms_provider || 'twilio';
    const fonecloudNumberIdFromCustomer = providerResult.rows[0]?.fonecloud_number_id;

    let twilioNumberId = null;
    let fonecloudNumberId = null;

    if (provider === 'fonecloud') {
      const fnResult = await client.query(
        `SELECT id FROM fonecloud_numbers WHERE (customer_id = $1 OR id = $2) AND is_active = true LIMIT 1`,
        [customerId, fonecloudNumberIdFromCustomer]
      );
      if (fnResult.rowCount > 0) {
        fonecloudNumberId = fnResult.rows[0].id;
      } else if (process.env.NODE_ENV !== 'test') {
        throw new Error('No Fonecloud number allocated for this customer');
      }
    } else {
      const twilioResult = await client.query(
        `SELECT id FROM twilio_numbers WHERE customer_id = $1 AND is_active = true LIMIT 1`,
        [customerId]
      );
      if (twilioResult.rowCount > 0) {
        twilioNumberId = twilioResult.rows[0].id;
      } else if (process.env.NODE_ENV !== 'test') {
        throw new Error('No active Twilio number available');
      }
    }

    const conversationResult = await client.query(
      `INSERT INTO conversations (customer_id, twilio_number_id, fonecloud_number_id, lead_name, lead_phone, lead_email, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')
       RETURNING *`,
      [customerId, twilioNumberId, fonecloudNumberId, leadName, leadPhone, leadEmail]
    );

    const conversation = conversationResult.rows[0];

    // Create lead
    await client.query(
      `INSERT INTO leads (customer_id, conversation_id, name, phone, email, source)
       VALUES ($1, $2, $3, $4, $5, 'sms')`,
      [customerId, conversation.id, leadName, leadPhone, leadEmail]
    );

    logInfo('Conversation created', {
      customerId,
      conversationId: conversation.id,
      leadPhone,
    });

    return conversation;
  });
};

// Close conversation
export const closeConversation = async (customerId, conversationId) => {
  const result = await query(
    `UPDATE conversations
     SET status = 'closed', updated_at = NOW()
     WHERE id = $1 AND customer_id = $2
     RETURNING *`,
    [conversationId, customerId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  logInfo('Conversation closed', { customerId, conversationId });

  return result.rows[0];
};

// Send message in conversation
export const sendMessage = async (customerId, conversationId, content, sender = 'system') => {
  const conversation = await query(
    `SELECT c.*, tn.phone_number as twilio_number, fn.phone_number as fonecloud_number,
            COALESCE(tn.phone_number, fn.phone_number) as reply_number
     FROM conversations c
     LEFT JOIN twilio_numbers tn ON c.twilio_number_id = tn.id
     LEFT JOIN fonecloud_numbers fn ON c.fonecloud_number_id = fn.id
     WHERE c.id = $1 AND c.customer_id = $2 AND c.status = 'active'`,
    [conversationId, customerId]
  );

  if (conversation.rowCount === 0) {
    throw new Error('Conversation not found or closed');
  }

  const conv = conversation.rows[0];
  const fromNumber = conv.reply_number || conv.twilio_number || conv.fonecloud_number;

  // Store message
  const messageResult = await query(
    `INSERT INTO messages (conversation_id, direction, sender, content)
     VALUES ($1, 'outbound', $2, $3)
     RETURNING *`,
    [conversationId, sender, content]
  );

  const message = messageResult.rows[0];

  // Queue SMS send via gateway
  await queueSms({
    customerId,
    to: conv.lead_phone,
    body: content,
    from: fromNumber,
    options: {
      conversationId,
      messageId: message.id,
    },
  });

  logInfo('Message sent', {
    customerId,
    conversationId,
    messageId: message.id,
  });

  return message;
};

// Get leads for customer
export const getLeads = async (customerId, options = {}) => {
  const { qualification, limit = 20, offset = 0, search } = options;

  let whereClause = 'WHERE l.customer_id = $1';
  const params = [customerId];
  let paramCount = 1;

  if (qualification) {
    paramCount++;
    whereClause += ` AND l.qualification = $${paramCount}`;
    params.push(qualification);
  }

  if (search) {
    paramCount++;
    whereClause += ` AND (l.name ILIKE $${paramCount} OR l.phone ILIKE $${paramCount})`;
    params.push(`%${search}%`);
  }

  params.push(limit, offset);

  const result = await query(
    `SELECT l.*, 
            c.lead_name as conversation_name,
            c.status as conversation_status,
            c.message_count,
            (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
     FROM leads l
     LEFT JOIN conversations c ON l.conversation_id = c.id
     ${whereClause}
     ORDER BY l.created_at DESC
     LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
    params
  );

  const countResult = await query(
    `SELECT COUNT(*) FROM leads l ${whereClause}`,
    params.slice(0, -2)
  );

  return {
    leads: result.rows,
    total: parseInt(countResult.rows[0].count),
    limit,
    offset,
  };
};

// Update lead
export const updateLead = async (customerId, leadId, updates) => {
  const allowedFields = ['name', 'email', 'qualification', 'notes', 'estimated_value', 'tags'];
  const setClause = [];
  const params = [];
  let paramCount = 0;

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key) && value !== undefined) {
      paramCount++;
      setClause.push(`${key} = $${paramCount}`);
      params.push(key === 'tags' ? JSON.stringify(value) : value);
    }
  }

  if (setClause.length === 0) {
    throw new Error('No valid fields to update');
  }

  paramCount++;
  params.push(leadId);
  paramCount++;
  params.push(customerId);

  const result = await query(
    `UPDATE leads
     SET ${setClause.join(', ')}, updated_at = NOW()
     WHERE id = $${paramCount - 1} AND customer_id = $${paramCount}
     RETURNING *`,
    params
  );

  if (result.rowCount === 0) {
    return null;
  }

  logInfo('Lead updated', { customerId, leadId, updates });

  return result.rows[0];
};

// Convert lead to customer
export const convertLead = async (customerId, leadId, conversionData) => {
  const { convertedValue } = conversionData;

  const result = await query(
    `UPDATE leads
     SET qualification = 'hot',
         converted_at = NOW(),
         converted_value = $1,
         updated_at = NOW()
     WHERE id = $2 AND customer_id = $3
     RETURNING *`,
    [convertedValue, leadId, customerId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  // Update conversation status
  await query(
    `UPDATE conversations
     SET status = 'converted', updated_at = NOW()
     WHERE id = $1`,
    [result.rows[0].conversation_id]
  );

  logInfo('Lead converted', { customerId, leadId, convertedValue });

  return result.rows[0];
};