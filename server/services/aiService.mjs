import { GoogleGenAI } from '@google/genai';
import { query } from '../utils/db.mjs';
import { logInfo, logError, logDebug } from '../utils/logger.mjs';
import { enqueueJob } from '../utils/redis.mjs';

const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenAI({ apiKey }) : null;

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

// Generate AI response
export const generateResponse = async (customerId, conversationId, leadMessage) => {
  checkCircuitBreaker();

  try {
    // Get customer AI settings
    const aiSettingsResult = await query(
      `SELECT system_prompt, temperature, max_tokens, response_tone, 
              language, greeting_template, closing_template, fallback_message
       FROM ai_settings
       WHERE customer_id = $1`,
      [customerId]
    );

    const aiSettings = aiSettingsResult.rows[0] || getDefaultAiSettings();

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

    // Call Gemini with retries
    let response;
    let lastError;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        logDebug('Calling Gemini API', { customerId, conversationId, attempt });

        const result = await genAI.models.generateContent({
          model: 'gemini-pro',
          contents: messages,
          config: {
            temperature: aiSettings.temperature,
            maxOutputTokens: aiSettings.max_tokens,
          },
        });

        response = result.response.text();
        recordSuccess();
        break;
      } catch (error) {
        lastError = error;
        logError('Gemini API call failed', {
          attempt,
          customerId,
          error: error.message,
        });

        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS * Math.pow(2, attempt - 1));
        }
      }
    }

    if (!response) {
      recordFailure();
      throw lastError || new Error('Failed to generate AI response');
    }

    // Clean up response
    response = response.trim();

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
  const { customerId, conversationId, leadMessage } = job;

  const result = await generateResponse(customerId, conversationId, leadMessage);

  if (result.success) {
    // Store AI response
    const messageResult = await query(
      `INSERT INTO messages (conversation_id, direction, sender, content)
       VALUES ($1, 'outbound', 'ai', $2)
       RETURNING id`,
      [conversationId, result.response]
    );

    // Update AI message count
    await query(
      `UPDATE conversations
       SET ai_response_count = ai_response_count + 1
       WHERE id = $1`,
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
  }

  return result;
};