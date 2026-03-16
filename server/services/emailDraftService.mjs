import { query } from '../utils/db.mjs';
import { logInfo, logError, logDebug } from '../utils/logger.mjs';
import { lookupOrderByEmailAndNumber, listRecentOrdersForCustomer } from './storeIntegrationService.mjs';

// ---------------------------------------------------------------------------
// AI-powered email draft generation
// ---------------------------------------------------------------------------

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Load per-customer AI settings with system defaults fallback.
 */
const loadAiSettings = async (customerId) => {
  const result = await query(
    `SELECT system_prompt, temperature, max_tokens, response_tone,
            language, greeting_template, closing_template, fallback_message,
            primary_provider, secondary_provider, gemini_model, groq_model, openai_model
     FROM ai_settings
     WHERE customer_id = $1`,
    [customerId]
  );

  const defaults = {
    system_prompt: '',
    temperature: 0.7,
    max_tokens: 800,
    response_tone: 'professional',
    language: 'da',
    greeting_template: null,
    closing_template: null,
    fallback_message: null,
    primary_provider: 'openai',
    secondary_provider: '',
    gemini_model: '',
    groq_model: '',
    openai_model: '',
  };

  return result.rows[0] || defaults;
};

/**
 * Load system-wide default model names.
 */
const getSystemDefaultModels = async () => {
  const result = await query(
    `SELECT key, value FROM system_settings WHERE key IN ('default_gemini_model', 'default_groq_model', 'default_openai_model')`,
    []
  );
  const map = {};
  for (const row of result.rows) {
    map[row.key] = row.value;
  }
  return {
    gemini: (map.default_gemini_model || '').trim() || 'gemini-2.5-flash',
    groq: (map.default_groq_model || '').trim() || (process.env.GROQ_MODEL || 'llama-3.1-8b-instant'),
    openai: (map.default_openai_model || '').trim() || (process.env.OPENAI_MODEL || 'gpt-4o-mini'),
  };
};

const toOpenAIMessages = (messages) =>
  messages.map((m) => ({
    role: m.role === 'model' ? 'assistant' : m.role,
    content: (m.parts || []).map((p) => p.text).filter(Boolean).join('\n') || '',
  }));

const callOpenAI = async (messages, settings, model) => {
  if (!OPENAI_API_KEY) throw new Error('OpenAI API key not configured');
  const body = {
    model,
    messages: toOpenAIMessages(messages),
    max_tokens: settings.max_tokens || 800,
    temperature: Math.min(1, Math.max(0, Number(settings.temperature) || 0.7)),
  };
  const res = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || '').trim();
};

const callGroq = async (messages, settings, model) => {
  if (!GROQ_API_KEY) throw new Error('Groq API key not configured');
  const body = {
    model,
    messages: toOpenAIMessages(messages),
    max_tokens: settings.max_tokens || 800,
    temperature: Math.min(1, Math.max(0, Number(settings.temperature) || 0.7)),
  };
  const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || '').trim();
};

const callGemini = async (messages, settings, model) => {
  if (!GEMINI_API_KEY) throw new Error('Gemini API key not configured');
  const { GoogleGenAI } = await import('@google/genai');
  const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const result = await genAI.models.generateContent({
    model,
    contents: messages,
    config: {
      temperature: settings.temperature,
      maxOutputTokens: settings.max_tokens,
    },
  });
  return result.response.text().trim();
};

/**
 * Call AI with provider failover.
 */
const callAIWithFailover = async (messages, settings, systemDefaults) => {
  const primary = (settings.primary_provider || 'openai').toLowerCase();
  const secondary = (settings.secondary_provider || '').toLowerCase();

  const geminiModel = (settings.gemini_model || '').trim() || systemDefaults.gemini;
  const groqModel = (settings.groq_model || '').trim() || systemDefaults.groq;
  const openaiModel = (settings.openai_model || '').trim() || systemDefaults.openai;

  const providersToTry = [];
  if (primary === 'gemini' && GEMINI_API_KEY) providersToTry.push({ name: 'gemini', model: geminiModel });
  else if (primary === 'groq' && GROQ_API_KEY) providersToTry.push({ name: 'groq', model: groqModel });
  else if (primary === 'openai' && OPENAI_API_KEY) providersToTry.push({ name: 'openai', model: openaiModel });

  if (secondary && secondary !== primary) {
    if (secondary === 'gemini' && GEMINI_API_KEY) providersToTry.push({ name: 'gemini', model: geminiModel });
    else if (secondary === 'groq' && GROQ_API_KEY) providersToTry.push({ name: 'groq', model: groqModel });
    else if (secondary === 'openai' && OPENAI_API_KEY) providersToTry.push({ name: 'openai', model: openaiModel });
  }

  // Fallback: try any available provider
  if (providersToTry.length === 0) {
    if (OPENAI_API_KEY) providersToTry.push({ name: 'openai', model: openaiModel });
    else if (GEMINI_API_KEY) providersToTry.push({ name: 'gemini', model: geminiModel });
    else if (GROQ_API_KEY) providersToTry.push({ name: 'groq', model: groqModel });
  }

  if (providersToTry.length === 0) {
    throw new Error('No AI provider configured');
  }

  let lastError;
  let usedModel = '';

  for (const { name, model } of providersToTry) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        let response;
        if (name === 'openai') response = await callOpenAI(messages, settings, model);
        else if (name === 'groq') response = await callGroq(messages, settings, model);
        else if (name === 'gemini') response = await callGemini(messages, settings, model);

        usedModel = `${name}/${model}`;
        return { text: response, model: usedModel };
      } catch (err) {
        lastError = err;
        logError(`Email draft AI call failed (${name})`, { attempt, error: err?.message });
        if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS * Math.pow(2, attempt - 1));
      }
    }
  }

  throw lastError || new Error('All AI providers failed for email draft');
};

// ---------------------------------------------------------------------------
// System prompt construction for email replies
// ---------------------------------------------------------------------------

const buildEmailSystemPrompt = (aiSettings, context) => {
  const lang = aiSettings.language === 'en' ? 'English' : 'Danish';
  const tone = aiSettings.response_tone || 'professional';

  const parts = [];

  parts.push(
    `You are an AI customer support assistant that drafts email replies on behalf of a business.`
  );
  parts.push(`Language: ${lang}. Tone: ${tone}.`);
  parts.push(
    `Your task: Read the customer's email and generate a helpful, accurate draft reply. ` +
    `The business owner will review and optionally edit your draft before it is sent. ` +
    `Do NOT fabricate information. If you lack data to answer a question, acknowledge it honestly ` +
    `and suggest the customer will receive a follow-up.`
  );

  if (aiSettings.system_prompt) {
    parts.push(`Business-specific instructions:\n${aiSettings.system_prompt}`);
  }

  // Inject e-commerce context
  if (context.orders && context.orders.length > 0) {
    const orderLines = context.orders.map((o) => {
      const items = [];
      if (o.external_id) items.push(`Order #${o.external_id}`);
      if (o.status) items.push(`status: ${o.status}`);
      if (o.total && o.currency) items.push(`total: ${o.total} ${o.currency}`);
      if (o.created_at_shop) items.push(`placed: ${new Date(o.created_at_shop).toLocaleDateString('da-DK')}`);
      return `- ${items.join(', ')}`;
    });
    parts.push(`\nRecent orders for this customer:\n${orderLines.join('\n')}`);
  }

  if (context.storeName) {
    parts.push(`\nThe customer's inquiry relates to the webshop "${context.storeName}" (${context.storeDomain || ''}).`);
  }

  parts.push(
    `\nFormat your reply as a ready-to-send email body (plain text). ` +
    `Include a greeting and sign-off. Do not include a subject line.`
  );

  return parts.join('\n\n');
};

// ---------------------------------------------------------------------------
// Main draft generation pipeline
// ---------------------------------------------------------------------------

/**
 * Process a single email_draft_generate job.
 * Loads the inbound email, builds context, calls AI, saves draft.
 */
export const processEmailDraftJob = async (job) => {
  const {
    customerId,
    emailAccountId,
    conversationId,
    emailMessageId,
    storeConnectionId,
  } = job;

  logDebug('Processing email draft job', { customerId, emailMessageId, conversationId });

  // 1. Load the inbound email message
  const emResult = await query(
    `SELECT * FROM email_messages WHERE id = $1 AND customer_id = $2 LIMIT 1`,
    [emailMessageId, customerId]
  );

  if (emResult.rowCount === 0) {
    logError('Email message not found for draft generation', { emailMessageId });
    return { success: false, reason: 'email_message_not_found' };
  }

  const emailMsg = emResult.rows[0];

  // 2. Check if AI auto-response is enabled for this customer
  const aiSettings = await loadAiSettings(customerId);
  if (aiSettings.auto_response_enabled === false) {
    logDebug('AI auto-response disabled, skipping email draft', { customerId });
    return { success: false, reason: 'auto_response_disabled' };
  }

  // 3. Load email account info for the reply-to address
  const acctResult = await query(
    `SELECT email_address, display_name FROM email_accounts WHERE id = $1 LIMIT 1`,
    [emailAccountId]
  );
  const emailAccount = acctResult.rows[0] || {};

  // 4. Build e-commerce context
  const context = {
    orders: [],
    storeName: null,
    storeDomain: null,
  };

  if (emailMsg.from_address) {
    try {
      const orders = await listRecentOrdersForCustomer({
        customerId,
        email: emailMsg.from_address,
        limit: 3,
      });
      context.orders = orders;
      if (orders.length > 0) {
        context.storeName = orders[0].store_name;
        context.storeDomain = orders[0].store_domain;
      }
    } catch (err) {
      logError('Failed to load order context for email draft', { error: err?.message });
    }
  }

  // 5. Load conversation history (previous messages in this thread)
  const historyResult = await query(
    `SELECT sender, content, channel, direction, created_at
     FROM messages
     WHERE conversation_id = $1
     ORDER BY created_at DESC
     LIMIT 10`,
    [conversationId]
  );
  const history = historyResult.rows.reverse();

  // 6. Build AI messages
  const systemPrompt = buildEmailSystemPrompt(aiSettings, context);

  const messages = [
    { role: 'system', parts: [{ text: systemPrompt }] },
  ];

  // Add prior conversation messages (excluding the current one which is the last)
  for (const msg of history.slice(0, -1)) {
    const role = msg.sender === 'lead' ? 'user' : 'model';
    messages.push({ role, parts: [{ text: msg.content }] });
  }

  // Add the current inbound email as the latest user message
  const emailBody = emailMsg.body_plain || emailMsg.snippet || emailMsg.subject || '(empty email)';
  const userMessage = `Subject: ${emailMsg.subject || '(no subject)'}\nFrom: ${emailMsg.from_address}\n\n${emailBody}`;
  messages.push({ role: 'user', parts: [{ text: userMessage }] });

  // 7. Call AI
  let aiResult;
  try {
    const systemDefaults = await getSystemDefaultModels();
    aiResult = await callAIWithFailover(messages, aiSettings, systemDefaults);
  } catch (err) {
    logError('AI draft generation failed', { customerId, emailMessageId, error: err?.message });

    // Save a fallback draft if we have a fallback_message
    if (aiSettings.fallback_message) {
      await saveDraft({
        customerId,
        emailAccountId,
        conversationId,
        emailMessageId,
        emailMsg,
        draftBody: aiSettings.fallback_message,
        aiModel: 'fallback',
      });
    }

    return { success: false, reason: 'ai_error', error: err?.message };
  }

  // 8. Save draft
  const draft = await saveDraft({
    customerId,
    emailAccountId,
    conversationId,
    emailMessageId,
    emailMsg,
    draftBody: aiResult.text,
    aiModel: aiResult.model,
  });

  logInfo('Email draft generated', {
    customerId,
    draftId: draft.id,
    conversationId,
    emailMessageId,
    model: aiResult.model,
  });

  return { success: true, draftId: draft.id };
};

/**
 * Persist an email draft to the database.
 */
const saveDraft = async ({
  customerId,
  emailAccountId,
  conversationId,
  emailMessageId,
  emailMsg,
  draftBody,
  aiModel,
}) => {
  const replySubject = (emailMsg.subject || '').startsWith('Re:')
    ? emailMsg.subject
    : `Re: ${emailMsg.subject || ''}`;

  const result = await query(
    `
      INSERT INTO email_drafts (
        customer_id,
        email_account_id,
        conversation_id,
        email_message_id,
        in_reply_to_provider_id,
        thread_id,
        to_addresses,
        cc_addresses,
        subject,
        body_plain,
        status,
        ai_model,
        meta
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'draft', $11, $12)
      RETURNING *
    `,
    [
      customerId,
      emailAccountId,
      conversationId,
      emailMessageId,
      emailMsg.provider_message_id || null,
      emailMsg.thread_id || null,
      [emailMsg.from_address], // reply to sender
      [], // no CC by default
      replySubject,
      draftBody,
      aiModel || null,
      { generatedAt: new Date().toISOString() },
    ]
  );

  return result.rows[0];
};

/**
 * List drafts for a customer, optionally filtered.
 */
export const listDrafts = async (customerId, { status, conversationId, limit = 50, offset = 0 } = {}) => {
  const conditions = ['d.customer_id = $1'];
  const params = [customerId];
  let idx = 2;

  if (status) {
    conditions.push(`d.status = $${idx++}`);
    params.push(status);
  }
  if (conversationId) {
    conditions.push(`d.conversation_id = $${idx++}`);
    params.push(conversationId);
  }

  params.push(limit, offset);

  const result = await query(
    `
      SELECT
        d.*,
        ea.email_address AS account_email,
        ea.display_name AS account_name,
        em.from_address AS original_from,
        em.subject AS original_subject,
        em.snippet AS original_snippet
      FROM email_drafts d
      LEFT JOIN email_accounts ea ON ea.id = d.email_account_id
      LEFT JOIN email_messages em ON em.id = d.email_message_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY d.created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `,
    params
  );

  return result.rows;
};

/**
 * Update a draft (edit body, approve, discard).
 */
export const updateDraft = async (customerId, draftId, updates) => {
  const { bodyPlain, bodyHtml, status, reviewedBy } = updates;

  const fields = [];
  const params = [];
  let idx = 1;

  if (bodyPlain !== undefined) {
    fields.push(`body_plain = $${idx++}`);
    params.push(bodyPlain);
  }
  if (bodyHtml !== undefined) {
    fields.push(`body_html = $${idx++}`);
    params.push(bodyHtml);
  }
  if (status !== undefined) {
    fields.push(`status = $${idx++}`);
    params.push(status);
    if (status === 'approved' || status === 'discarded') {
      fields.push(`reviewed_at = NOW()`);
      if (reviewedBy) {
        fields.push(`reviewed_by = $${idx++}`);
        params.push(reviewedBy);
      }
    }
  }

  if (fields.length === 0) {
    return null;
  }

  params.push(draftId, customerId);

  const result = await query(
    `
      UPDATE email_drafts
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${idx++}
        AND customer_id = $${idx++}
        AND status = 'draft'
      RETURNING *
    `,
    params
  );

  return result.rows[0] || null;
};
