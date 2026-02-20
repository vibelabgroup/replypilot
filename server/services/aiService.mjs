import { GoogleGenAI } from '@google/genai';
import { query } from '../utils/db.mjs';
import { logInfo, logError, logDebug } from '../utils/logger.mjs';
import { enqueueJob } from '../utils/redis.mjs';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const genAI = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

// Circuit breaker state
const circuitBreaker = {
  failures: 0,
  lastFailureTime: null,
  state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
  threshold: 5,
  timeout: 60000, // 1 minute
};

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// Sleep helper
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Check circuit breaker
const checkCircuitBreaker = () => {
  if (circuitBreaker.state === 'OPEN') {
    const now = Date.now();
    if (now - circuitBreaker.lastFailureTime > circuitBreaker.timeout) {
      circuitBreaker.state = 'HALF_OPEN';
      circuitBreaker.failures = 0;
      logInfo('AI circuit breaker moved to HALF_OPEN');
    } else {
      throw new Error('AI service circuit breaker is OPEN');
    }
  }
};

// Record success
const recordSuccess = () => {
  if (circuitBreaker.state === 'HALF_OPEN') {
    circuitBreaker.state = 'CLOSED';
    circuitBreaker.failures = 0;
    logInfo('AI circuit breaker moved to CLOSED');
  }
};

// Record failure
const recordFailure = () => {
  circuitBreaker.failures++;
  circuitBreaker.lastFailureTime = Date.now();
  
  if (circuitBreaker.failures >= circuitBreaker.threshold) {
    circuitBreaker.state = 'OPEN';
    logError('AI circuit breaker moved to OPEN');
  }
};

// Convert internal messages (role + parts[].text) to OpenAI/Groq format (role + content string)
const toOpenAIMessages = (messages) =>
  messages.map((m) => ({
    role: m.role === 'model' ? 'assistant' : m.role,
    content: (m.parts || []).map((p) => p.text).filter(Boolean).join('\n') || '',
  }));

// Load system default AI models (for new clients; used when per-client override is null)
const getSystemDefaultModels = async () => {
  const result = await query(
    `SELECT key, value FROM system_settings WHERE key IN ('default_gemini_model', 'default_groq_model')`,
    []
  );
  const map = {};
  for (const row of result.rows) {
    map[row.key] = row.value;
  }
  return {
    gemini: (map.default_gemini_model || '').trim() || 'gemini-2.5-flash',
    groq: (map.default_groq_model || '').trim() || GROQ_MODEL,
  };
};

// Call Groq (OpenAI-compatible API)
const callGroq = async (messages, aiSettings, modelOverride = null) => {
  if (!GROQ_API_KEY) {
    throw new Error('Groq API key not configured');
  }
  const model = modelOverride || GROQ_MODEL;
  const body = {
    model,
    messages: toOpenAIMessages(messages),
    max_tokens: aiSettings.max_tokens || 500,
    temperature: Math.min(1, Math.max(0, Number(aiSettings.temperature) || 0.7)),
  };
  const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (text == null) {
    throw new Error('Groq API returned no content');
  }
  return String(text).trim();
};

// Call Gemini
const callGemini = async (messages, aiSettings, modelOverride = null) => {
  if (!genAI) {
    throw new Error('Gemini API key not configured');
  }
  const model = modelOverride || 'gemini-2.5-flash';
  const result = await genAI.models.generateContent({
    model,
    contents: messages,
    config: {
      temperature: aiSettings.temperature,
      maxOutputTokens: aiSettings.max_tokens,
    },
  });
  return result.response.text().trim();
};

// Generate AI response
export const generateResponse = async (customerId, conversationId, leadMessage) => {
  checkCircuitBreaker();

  try {
    // Get customer AI settings (include provider order and model overrides)
    const aiSettingsResult = await query(
      `SELECT system_prompt, temperature, max_tokens, response_tone, 
              language, greeting_template, closing_template, fallback_message,
              primary_provider, secondary_provider, gemini_model, groq_model
       FROM ai_settings
       WHERE customer_id = $1`,
      [customerId]
    );

    const aiSettings = aiSettingsResult.rows[0] || getDefaultAiSettings();
    const systemDefaults = await getSystemDefaultModels();
    const geminiModel = (aiSettings.gemini_model || '').trim() || systemDefaults.gemini;
    const groqModel = (aiSettings.groq_model || '').trim() || systemDefaults.groq;

    const primary = (aiSettings.primary_provider || 'gemini').toLowerCase();
    const secondary = (aiSettings.secondary_provider || '').toLowerCase();
    const providersToTry = [];
    if (primary && (primary === 'gemini' ? GEMINI_API_KEY : primary === 'groq' && GROQ_API_KEY)) {
      providersToTry.push(primary);
    }
    if (secondary && secondary !== primary && (secondary === 'gemini' ? GEMINI_API_KEY : secondary === 'groq' && GROQ_API_KEY)) {
      providersToTry.push(secondary);
    }
    if (providersToTry.length === 0) {
      throw new Error('No AI provider configured (set GEMINI_API_KEY and/or GROQ_API_KEY)');
    }

    // Get conversation history (last 5 messages)
    const historyResult = await query(
      `SELECT sender, content, created_at
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at DESC
       LIMIT 5`,
      [conversationId]
    );

    const history = historyResult.rows.reverse();

    // Build system prompt
    const systemPrompt = buildSystemPrompt(aiSettings);

    // Build conversation context
    const messages = [
      {
        role: 'system',
        parts: [{ text: systemPrompt }],
      },
    ];

    // Add history
    for (const msg of history) {
      const role = msg.sender === 'lead' ? 'user' : 'model';
      messages.push({
        role,
        parts: [{ text: msg.content }],
      });
    }

    // Add current message
    messages.push({
      role: 'user',
      parts: [{ text: leadMessage }],
    });

    // Try each configured provider (primary then secondary) with retries
    let response;
    let lastError;

    for (const provider of providersToTry) {
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          logDebug(`Calling ${provider} API`, { customerId, conversationId, attempt });
          if (provider === 'gemini') {
            response = await callGemini(messages, aiSettings, geminiModel);
          } else if (provider === 'groq') {
            response = await callGroq(messages, aiSettings, groqModel);
          } else {
            continue;
          }
          recordSuccess();
          break;
        } catch (error) {
          lastError = error;
          logError(`${provider} API call failed`, {
            attempt,
            customerId,
            error: error.message,
          });
          if (attempt < MAX_RETRIES) {
            await sleep(RETRY_DELAY_MS * Math.pow(2, attempt - 1));
          }
        }
      }
      if (response) break;
    }

    if (!response) {
      recordFailure();
      throw lastError || new Error('Failed to generate AI response');
    }

    // response already trimmed by callGemini/callGroq

    // Add greeting if first message in conversation and enabled
    if (history.length === 0 && aiSettings.greeting_template) {
      response = `${aiSettings.greeting_template}\n\n${response}`;
    }

    logInfo('AI response generated', {
      customerId,
      conversationId,
      responseLength: response.length,
    });

    return {
      success: true,
      response,
      aiSettings,
    };
  } catch (error) {
    logError('AI generation failed', {
      customerId,
      conversationId,
      error: error.message,
    });

    // Return fallback message
    const fallback = await getFallbackMessage(customerId);
    
    return {
      success: false,
      response: fallback,
      error: error.message,
      isFallback: true,
    };
  }
};

// Load global demo AI settings from system_settings
const getDemoAiSettings = async () => {
  const result = await query(
    `SELECT key, value FROM system_settings WHERE key LIKE 'demo_ai_%'`,
    []
  );

  const map = {};
  for (const row of result.rows) {
    map[row.key] = row.value;
  }

  const agentName = map['demo_ai_agent_name'] || '';
  const toneRaw = map['demo_ai_tone'] || 'professionel';
  const language = map['demo_ai_language'] === 'en' ? 'en' : 'da';
  const instructions = map['demo_ai_instructions'] || '';
  const maxTokens = Number.parseInt(map['demo_ai_max_tokens'] || '', 10);
  const fallbackMessage = map['demo_ai_fallback_message'] || null;

  const toneMap = {
    professionel: 'professional',
    professional: 'professional',
    venlig: 'friendly',
    friendly: 'friendly',
    uformel: 'casual',
    casual: 'casual',
    formel: 'formal',
    formal: 'formal',
  };

  const responseTone = toneMap[toneRaw] || 'professional';

  const base = getDefaultAiSettings();

  const systemPromptParts = [getDefaultSystemPrompt()];
  if (agentName) {
    systemPromptParts.unshift(
      `Du er en AI-receptionist ved navn ${agentName}.`
    );
  }
  if (instructions) {
    systemPromptParts.push(
      `Særlige instruktioner fra virksomheden:\n${instructions}`
    );
  }

  const primaryProvider = (map['demo_ai_primary_provider'] || 'gemini').toLowerCase();
  const secondaryProvider = (map['demo_ai_secondary_provider'] || '').toLowerCase();

  return {
    system_prompt: systemPromptParts.join('\n\n'),
    temperature: base.temperature,
    max_tokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : base.max_tokens,
    response_tone: responseTone,
    language,
    enable_greetings: true,
    greeting_template: null,
    enable_closings: true,
    closing_template: null,
    auto_response_enabled: true,
    auto_response_delay_seconds: 0,
    working_hours_only: false,
    fallback_message:
      fallbackMessage ||
      'Tak for dit opkald. Svar gerne på denne SMS med lidt om hvad du har brug for, så vender vi tilbage hurtigst muligt.',
    primary_provider: primaryProvider === 'groq' ? 'groq' : 'gemini',
    secondary_provider: secondaryProvider === 'groq' || secondaryProvider === 'gemini' ? secondaryProvider : '',
  };
};

const normalizeDemoHistory = (history = []) => {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => m && (m.role === 'user' || m.role === 'model') && typeof m.text === 'string')
    .map((m) => ({
      role: m.role,
      parts: [{ text: m.text.slice(0, 2000) }],
    }))
    .slice(-10);
};

const generateDemoProviderResponse = async (messages, aiSettings) => {
  const systemDefaults = await getSystemDefaultModels();
  const primary = (aiSettings.primary_provider || 'gemini').toLowerCase();
  const secondary = (aiSettings.secondary_provider || '').toLowerCase();
  const providersToTry = [];

  if (primary && (primary === 'gemini' ? GEMINI_API_KEY : primary === 'groq' && GROQ_API_KEY)) {
    providersToTry.push(primary);
  }
  if (secondary && secondary !== primary && (secondary === 'gemini' ? GEMINI_API_KEY : secondary === 'groq' && GROQ_API_KEY)) {
    providersToTry.push(secondary);
  }
  if (providersToTry.length === 0) {
    throw new Error('No AI provider configured for demo');
  }

  let response;
  let lastError;

  for (const provider of providersToTry) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (provider === 'gemini') {
          response = await callGemini(messages, aiSettings, systemDefaults.gemini);
        } else if (provider === 'groq') {
          response = await callGroq(messages, aiSettings, systemDefaults.groq);
        } else {
          continue;
        }
        recordSuccess();
        break;
      } catch (error) {
        lastError = error;
        logError(`${provider} API call failed (demo/public)`, {
          attempt,
          error: error.message,
        });
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS * Math.pow(2, attempt - 1));
        }
      }
    }
    if (response) break;
  }

  if (!response) {
    recordFailure();
    throw lastError || new Error('Failed to generate demo AI response');
  }

  return response;
};

export const generateDemoLiveResponse = async (leadMessage, history = []) => {
  checkCircuitBreaker();
  try {
    const aiSettings = await getDemoAiSettings();
    const systemPrompt = buildSystemPrompt(aiSettings);
    const messages = [
      {
        role: 'system',
        parts: [{ text: systemPrompt }],
      },
      ...normalizeDemoHistory(history),
      {
        role: 'user',
        parts: [{ text: String(leadMessage || '').slice(0, 2000) }],
      },
    ];

    const response = await generateDemoProviderResponse(messages, aiSettings);
    return { success: true, response };
  } catch (error) {
    logError('Live demo AI generation failed', {
      error: error.message,
    });
    const fallback =
      (await getDemoAiSettings()).fallback_message ||
      'Tak for dit opkald. Vi har desværre tekniske problemer lige nu, men vender tilbage hurtigst muligt.';
    return {
      success: false,
      response: fallback,
      error: error.message,
      isFallback: true,
    };
  }
};

// Generate AI response for demo flow using global admin settings
const generateDemoResponse = async (conversationId, leadMessage) => {
  checkCircuitBreaker();

  try {
    const aiSettings = await getDemoAiSettings();

    // Get conversation history (last 5 messages)
    const historyResult = await query(
      `SELECT sender, content, created_at
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at DESC
       LIMIT 5`,
      [conversationId]
    );

    const history = historyResult.rows.reverse();

    // Build system prompt
    const systemPrompt = buildSystemPrompt(aiSettings);

    const messages = [
      {
        role: 'system',
        parts: [{ text: systemPrompt }],
      },
    ];

    for (const msg of history) {
      const role = msg.sender === 'lead' ? 'user' : 'model';
      messages.push({
        role,
        parts: [{ text: msg.content }],
      });
    }

    messages.push({
      role: 'user',
      parts: [{ text: leadMessage }],
    });

    logDebug('Generating demo AI response', { conversationId });
    let response = await generateDemoProviderResponse(messages, aiSettings);

    if (history.length === 0 && aiSettings.greeting_template) {
      response = `${aiSettings.greeting_template}\n\n${response}`;
    }

    return {
      success: true,
      response,
      aiSettings,
    };
  } catch (error) {
    logError('Demo AI generation failed', {
      error: error.message,
    });

    const fallback =
      (await getDemoAiSettings()).fallback_message ||
      'Tak for dit opkald. Vi har desværre tekniske problemer lige nu, men vender tilbage hurtigst muligt.';

    return {
      success: false,
      response: fallback,
      error: error.message,
      isFallback: true,
    };
  }
};

// Queue AI response generation
export const queueAIResponse = async (customerId, conversationId, leadMessage, delayMs = 30000) => {
  await enqueueJob('ai_queue', {
    type: 'ai_generate',
    customerId,
    conversationId,
    leadMessage,
    delayMs,
    scheduledFor: Date.now() + delayMs,
  });

  logDebug('AI response queued', { customerId, conversationId, delayMs });
  return { queued: true };
};

// Build system prompt from settings
const buildSystemPrompt = (settings) => {
  const basePrompt = settings.system_prompt || getDefaultSystemPrompt();
  
  const toneInstructions = {
    professional: 'Maintain a professional and courteous tone.',
    friendly: 'Be warm and approachable.',
    casual: 'Keep it relaxed and conversational.',
    formal: 'Use formal business language.',
  };

  const tone = toneInstructions[settings.response_tone] || toneInstructions.professional;
  const language = settings.language === 'da' ? 'Danish' : 'English';

  return `${basePrompt}

${tone}

IMPORTANT INSTRUCTIONS:
- Always respond in ${language}
- Keep responses concise (under 1600 characters for SMS)
- Be helpful and professional
- If you cannot answer a question, suggest the lead contact the business directly
- Do not make promises or commitments on behalf of the business
- Collect relevant information: name, specific needs, preferred contact time
- Never share internal business information or pricing unless explicitly provided`;
};

// Get default system prompt
const getDefaultSystemPrompt = () => {
  return `You are an AI receptionist for a Danish business. Your role is to:
1. Greet leads warmly and professionally
2. Answer questions about the business based on the information provided
3. Gather important details from leads (name, needs, contact preferences)
4. Provide helpful information and guide leads to the next step
5. Always maintain a helpful, professional tone

You represent the business and are the first point of contact for potential customers.`;
};

// Get default AI settings
const getDefaultAiSettings = () => ({
  temperature: 0.7,
  max_tokens: 500,
  response_tone: 'professional',
  language: 'da',
  greeting_template: null,
  closing_template: null,
  fallback_message: null,
  primary_provider: 'gemini',
  secondary_provider: null,
});

// Get fallback message
const getFallbackMessage = async (customerId) => {
  const result = await query(
    `SELECT fallback_message FROM ai_settings WHERE customer_id = $1`,
    [customerId]
  );

  return (
    result.rows[0]?.fallback_message ||
    'Tak for din besked. Jeg viderebringer den til virksomheden, og vi vender tilbage hurtigst muligt.'
  );
};

// Process AI generation job (for workers)
export const processAIGenerationJob = async (job) => {
  const { customerId, conversationId, leadMessage, demo } = job;

  const result = demo
    ? await generateDemoResponse(conversationId, leadMessage)
    : await generateResponse(customerId, conversationId, leadMessage);

  // Even if AI generation failed, we may still have a fallback response.
  if (!result.response) {
    return result;
  }

  // Store AI (or fallback) response
  const messageResult = await query(
    `
      INSERT INTO messages (conversation_id, direction, sender, content)
      VALUES ($1, 'outbound', 'ai', $2)
      RETURNING id
    `,
    [conversationId, result.response]
  );

  // Update AI message count
  await query(
    `
      UPDATE conversations
      SET ai_response_count = ai_response_count + 1
      WHERE id = $1
    `,
    [conversationId]
  );

  // Queue SMS send
  const conversation = await query(
    `SELECT lead_phone FROM conversations WHERE id = $1`,
    [conversationId]
  );

  if (conversation.rowCount > 0) {
    const { queueSms } = await import('../sms/gateway.mjs');
    await queueSms({
      customerId,
      to: conversation.rows[0].lead_phone,
      body: result.response,
      options: {
        conversationId,
        messageId: messageResult.rows[0].id,
      },
    });
  }

  return result;
};