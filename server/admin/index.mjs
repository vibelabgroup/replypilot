import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import Stripe from 'stripe';
import Twilio from 'twilio';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { logInfo } from '../utils/logger.mjs';
import { authMiddleware, requireAdmin, setSessionCookie, clearSessionCookie } from '../middleware/auth.mjs';
import { errorHandler, asyncHandler, createUnauthorizedError } from '../middleware/errorHandler.mjs';
import { login as authLogin, logout as authLogout } from '../services/authService.mjs';
import { query, checkDbHealth } from '../core/db.mjs';
import { initDb } from '../db.mjs';
import { redis } from '../core/redis.mjs';
import { queueSms, provisionNumber } from '../core/sms/gateway.mjs';
import { generateResponse } from '../services/aiService.mjs';
import {
  getPoolNumbers,
  getAllocatedNumbers,
  addToPool,
  releaseToPool,
} from '../services/fonecloudNumberService.mjs';

const app = express();
const port = process.env.ADMIN_API_PORT || 3100;

// CORS configuration – allow admin frontend and main app frontend
// We support multiple allowed origins so that minor env misconfigurations
// (or multiple frontends hitting the admin API) don't immediately cause CORS failures.
const adminFrontendOrigin = process.env.ADMIN_FRONTEND_URL || 'http://localhost:5173';
const mainFrontendOrigin = process.env.FRONTEND_URL || null;

const allowedOrigins = [adminFrontendOrigin, mainFrontendOrigin].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser / same-origin requests with no Origin header
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // In production this will result in a CORS failure in the browser,
    // but we avoid crashing the server.
    return callback(null, false);
  },
  credentials: true,
};

// Allow cross-site cookies + CORS from the admin frontend
app.use(cors(corsOptions));
// Handle ALL preflight requests (including /api/admin/auth/login)
app.options('*', cors(corsOptions));

app.use(cookieParser());
app.use(helmet());
app.use(express.json());

// CSRF origin check: reject cross-origin state-changing requests
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin) return next();
  if (allowedOrigins.includes(origin)) return next();
  return res.status(403).json({ error: 'Forbidden' });
});

// Rate limiter for admin auth endpoints
const adminAuthRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Too many login attempts, please try again later' },
});

// Attach req.auth using shared middleware
app.use(authMiddleware);

// ---- Auth routes (admin-scoped) ----

app.post(
  '/api/admin/auth/login',
  adminAuthRateLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};

    if (!email || !password) {
      throw createUnauthorizedError('Email and password are required');
    }

    const ipAddress = req.ip;
    const userAgent = req.get('user-agent') || undefined;

    const { user, token } = await authLogin(email, password, ipAddress, userAgent);

    if (user.role !== 'admin') {
      throw createUnauthorizedError('Admin account required');
    }

    setSessionCookie(res, token);

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  })
);

app.post(
  '/api/admin/auth/logout',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.session;
    if (token) {
      await authLogout(token);
    }
    clearSessionCookie(res);
    res.status(204).end();
  })
);

// ---- Admin-only routes ----

// List customers with high-level status
app.get(
  '/api/admin/customers',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 25, 1), 200);
    const offset = (page - 1) * pageSize;

    const [customersResult, countResult] = await Promise.all([
      query(
        `
          SELECT 
            c.id,
            c.email,
            c.name,
            c.phone,
            c.status,
            c.subscription_status,
            c.current_period_end,
            c.shopify_enabled,
            c.max_store_connections,
            c.sms_provider,
            c.fonecloud_sender_id,
            c.stripe_customer_id,
            (
              SELECT tn.phone_number
              FROM twilio_numbers tn
              WHERE tn.customer_id = c.id AND tn.is_active = true
              ORDER BY tn.created_at DESC
              LIMIT 1
            ) AS twilio_phone_number,
            (
              SELECT fn.phone_number
              FROM fonecloud_numbers fn
              WHERE fn.customer_id = c.id AND fn.is_active = true
              LIMIT 1
            ) AS fonecloud_phone_number,
            c.created_at
          FROM customers c
          ORDER BY c.created_at DESC
          LIMIT $1 OFFSET $2
        `,
        [pageSize, offset]
      ),
      query(`SELECT COUNT(*) AS total FROM customers`, []),
    ]);

    const total = parseInt(countResult.rows[0].total, 10) || 0;

    res.json({
      data: customersResult.rows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(Math.ceil(total / pageSize), 1),
      },
    });
  })
);

// Customer detail including SMS config and usage stats
app.get(
  '/api/admin/customers/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const [customerResult, usageResult, notifResult] = await Promise.all([
      query(
        `
          SELECT 
            c.*,
            cs.company_name,
            cs.website,
            cs.industry,
            cs.phone_number AS company_phone_number,
            cs.address AS company_address,
            cs.city AS company_city,
            cs.postal_code AS company_postal_code,
            cs.country AS company_country,
            cs.contact_name,
            cs.contact_email,
            cs.contact_phone,
            cs.opening_hours,
            cs.forwarding_number,
            cs.email_forward,
            cs.notes AS company_notes,
            cs.vat_number,
            cs.service_area,
            ai.agent_name AS ai_agent_name,
            ai.tone AS ai_tone,
            ai.language AS ai_language,
            ai.custom_instructions AS ai_custom_instructions,
            ai.max_message_length AS ai_max_message_length,
            ai.gemini_model AS ai_gemini_model,
            ai.groq_model AS ai_groq_model,
            (
              SELECT tn.phone_number
              FROM twilio_numbers tn
              WHERE tn.customer_id = c.id AND tn.is_active = true
              ORDER BY tn.created_at DESC
              LIMIT 1
            ) AS twilio_phone_number,
            c.fonecloud_number_id,
            (
              SELECT fn.phone_number
              FROM fonecloud_numbers fn
              WHERE fn.id = c.fonecloud_number_id AND fn.is_active = true
              LIMIT 1
            ) AS fonecloud_phone_number
          FROM customers c
          LEFT JOIN company_settings cs ON cs.customer_id = c.id
          LEFT JOIN ai_settings ai ON ai.customer_id = c.id
          WHERE c.id = $1
        `,
        [id]
      ),
      query(
        `
          SELECT
            COUNT(DISTINCT conv.id) AS conversations_count,
            COUNT(m.id) AS messages_count
          FROM conversations conv
          LEFT JOIN messages m ON m.conversation_id = conv.id
          WHERE conv.customer_id = $1
        `,
        [id]
      ),
      query(
        `
          SELECT 
            email_enabled,
            email_new_lead,
            email_new_message,
            email_daily_digest,
            email_weekly_report,
            sms_enabled,
            sms_phone,
            sms_new_lead,
            sms_new_message,
            digest_type,
            digest_time
          FROM notification_preferences
          WHERE customer_id = $1 AND user_id IS NULL
          LIMIT 1
        `,
        [id]
      ),
    ]);

    if (customerResult.rowCount === 0) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    const customer = customerResult.rows[0];
    const usage = usageResult.rows[0] || {
      conversations_count: 0,
      messages_count: 0,
    };

    const notif = notifResult.rows[0] || null;

    res.json({
      customer: notif
        ? {
            ...customer,
            notify_email_enabled: notif.email_enabled,
            notify_email_new_lead: notif.email_new_lead,
            notify_email_new_message: notif.email_new_message,
            notify_email_daily_digest: notif.email_daily_digest,
            notify_email_weekly_report: notif.email_weekly_report,
            notify_sms_enabled: notif.sms_enabled,
            notify_sms_phone: notif.sms_phone,
            notify_sms_new_lead: notif.sms_new_lead,
            notify_sms_new_message: notif.sms_new_message,
            notify_digest_type: notif.digest_type,
            notify_digest_time: notif.digest_time,
          }
        : customer,
      usage,
    });
  })
);

// Update AI configuration for a customer
app.patch(
  '/api/admin/customers/:id/ai',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
      agent_name,
      tone,
      language,
      custom_instructions,
      max_message_length,
      primary_provider,
      secondary_provider,
      gemini_model,
      groq_model,
    } = req.body || {};

    const clamp = (s, max) =>
      typeof s === 'string' ? s.slice(0, max) : s ?? null;
    const clampModel = (s) =>
      typeof s === 'string' ? s.trim().slice(0, 120) || null : null;

    const aiData = {
      agent_name: clamp(agent_name, 100),
      tone: clamp(tone, 50),
      language: clamp(language, 20),
      custom_instructions: clamp(custom_instructions, 5000),
      max_message_length:
        typeof max_message_length === 'number'
          ? Math.max(50, Math.min(max_message_length, 500))
          : null,
      primary_provider:
        primary_provider === 'openai' ? 'openai' : primary_provider === 'groq' ? 'groq' : 'gemini',
      secondary_provider:
        secondary_provider === 'openai' || secondary_provider === 'gemini' || secondary_provider === 'groq'
          ? secondary_provider
          : null,
      gemini_model: clampModel(gemini_model),
      groq_model: clampModel(groq_model),
    };

    const result = await query(
      `
        INSERT INTO ai_settings (
          customer_id,
          agent_name,
          tone,
          language,
          custom_instructions,
          max_message_length,
          primary_provider,
          secondary_provider,
          gemini_model,
          groq_model
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (customer_id) DO UPDATE
        SET
          agent_name = EXCLUDED.agent_name,
          tone = EXCLUDED.tone,
          language = EXCLUDED.language,
          custom_instructions = EXCLUDED.custom_instructions,
          max_message_length = EXCLUDED.max_message_length,
          primary_provider = EXCLUDED.primary_provider,
          secondary_provider = EXCLUDED.secondary_provider,
          gemini_model = EXCLUDED.gemini_model,
          groq_model = EXCLUDED.groq_model,
          updated_at = NOW()
        RETURNING
          customer_id,
          agent_name,
          tone,
          language,
          custom_instructions,
          max_message_length,
          primary_provider,
          secondary_provider,
          gemini_model,
          groq_model;
      `,
      [
        id,
        aiData.agent_name,
        aiData.tone,
        aiData.language,
        aiData.custom_instructions,
        aiData.max_message_length,
        aiData.primary_provider,
        aiData.secondary_provider,
        aiData.gemini_model,
        aiData.groq_model,
      ]
    );

    const row = result.rows[0];

    res.json({
      success: true,
      ai: row,
    });
  })
);

// Update SMS provider configuration for a customer
app.patch(
  '/api/admin/customers/:id/sms',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { provider, fonecloud_sender_id, fonecloud_number_id } = req.body || {};

    if (provider && !['twilio', 'fonecloud'].includes(provider)) {
      res.status(400).json({
        error: "Invalid provider. Must be 'twilio' or 'fonecloud'.",
      });
      return;
    }

    if (fonecloud_number_id) {
      const fnCheck = await query(
        `SELECT id FROM fonecloud_numbers WHERE id = $1 AND customer_id IS NULL AND is_active = true`,
        [fonecloud_number_id]
      );
      if (fnCheck.rowCount === 0) {
        res.status(400).json({ error: 'Fonecloud number not found or already allocated' });
        return;
      }
      await query(
        `UPDATE fonecloud_numbers SET customer_id = $1, allocated_at = NOW(), updated_at = NOW() WHERE id = $2`,
        [id, fonecloud_number_id]
      );
    }

    const result = await query(
      `
        UPDATE customers
        SET
          sms_provider = COALESCE($1, sms_provider),
          fonecloud_sender_id = COALESCE($2, fonecloud_sender_id),
          fonecloud_number_id = COALESCE($3, fonecloud_number_id),
          updated_at = NOW()
        WHERE id = $4
        RETURNING id, email, name, sms_provider, fonecloud_sender_id, fonecloud_number_id
      `,
      [provider || null, fonecloud_sender_id ?? undefined, fonecloud_number_id ?? undefined, id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    const customer = result.rows[0];

    res.json({
      success: true,
      customer,
    });
  })
);

// Update shop integration feature flags and limits for a customer
app.patch(
  '/api/admin/customers/:id/shop-integrations',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { shopify_enabled, max_store_connections } = req.body || {};

    if (
      shopify_enabled !== undefined &&
      typeof shopify_enabled !== 'boolean'
    ) {
      return res
        .status(400)
        .json({ error: 'shopify_enabled must be a boolean when provided' });
    }

    if (
      max_store_connections !== undefined &&
      max_store_connections !== null &&
      (typeof max_store_connections !== 'number' ||
        !Number.isInteger(max_store_connections) ||
        max_store_connections < 0)
    ) {
      return res.status(400).json({
        error:
          'max_store_connections must be a non-negative integer or null when provided',
      });
    }

    const fields = [];
    const params = [];
    let idx = 1;

    if (shopify_enabled !== undefined) {
      fields.push(`shopify_enabled = $${idx++}`);
      params.push(shopify_enabled);
    }
    if (max_store_connections !== undefined) {
      fields.push(`max_store_connections = $${idx++}`);
      params.push(max_store_connections === null ? null : max_store_connections);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    params.push(id);

    const result = await query(
      `
        UPDATE customers
        SET ${fields.join(', ')}, updated_at = NOW()
        WHERE id = $${idx}
        RETURNING id, email, name, shopify_enabled, max_store_connections
      `,
      params
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json({
      success: true,
      customer: result.rows[0],
    });
  })
);

// Test SMS send for a customer (queues a job, does not guarantee delivery)
app.post(
  '/api/admin/customers/:id/test-sms',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { to, body } = req.body || {};

    if (!to || !body) {
      res.status(400).json({ error: 'Both `to` and `body` are required' });
      return;
    }

    await queueSms({
      customerId: id,
      to,
      body,
    });

    res.json({
      success: true,
      queued: true,
    });
  })
);

// Allocate a Fonecloud number from pool to a customer (admin)
app.post(
  '/api/admin/customers/:id/allocate-fonecloud-number',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await provisionNumber({ customerId: id });
    if (result.success) {
      res.json({ success: true, phoneNumber: result.phoneNumber });
      return;
    }
    const status = result.error?.includes('No Fonecloud numbers available') ? 503 : 400;
    res.status(status).json({ error: result.error || 'Allocation failed' });
  })
);

// ---- Fonecloud numbers pool ----
app.get(
  '/api/admin/fonecloud-numbers',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const status = req.query.status; // 'pool' | 'allocated' | omit = all
    let rows;
    if (status === 'pool') {
      rows = await getPoolNumbers();
    } else if (status === 'allocated') {
      rows = await getAllocatedNumbers();
    } else {
      const [poolRows, allocRows] = await Promise.all([getPoolNumbers(), getAllocatedNumbers()]);
      rows = [...allocRows.map((r) => ({ ...r, _section: 'allocated' })), ...poolRows.map((r) => ({ ...r, _section: 'pool' }))];
    }
    res.json({ data: rows });
  })
);

app.post(
  '/api/admin/fonecloud-numbers',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { phone_number, notes } = req.body || {};
    if (!phone_number || typeof phone_number !== 'string') {
      res.status(400).json({ error: 'phone_number is required' });
      return;
    }
    const row = await addToPool(phone_number.trim(), notes || null);
    res.status(201).json(row);
  })
);

app.patch(
  '/api/admin/fonecloud-numbers/:id/release',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const numResult = await query(
      `SELECT id, customer_id, phone_number FROM fonecloud_numbers WHERE id = $1 AND customer_id IS NOT NULL AND is_active = true`,
      [id]
    );
    if (numResult.rowCount === 0) {
      res.status(404).json({ error: 'Number not found or not allocated' });
      return;
    }
    const { customer_id, phone_number } = numResult.rows[0];
    const result = await releaseToPool(customer_id, phone_number);
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ success: true });
  })
);

// List conversations for a customer (for admin Messages section)
app.get(
  '/api/admin/customers/:id/conversations',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const [listResult, countResult] = await Promise.all([
      query(
        `
          SELECT
            c.id,
            c.lead_name,
            c.lead_phone,
            c.lead_email,
            c.status,
            c.message_count,
            c.ai_response_count,
            c.last_message_at,
            c.created_at,
            (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message_preview
          FROM conversations c
          WHERE c.customer_id = $1
          ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
          LIMIT $2 OFFSET $3
        `,
        [id, limit, offset]
      ),
      query(`SELECT COUNT(*) AS total FROM conversations WHERE customer_id = $1`, [id]),
    ]);

    const total = parseInt(countResult.rows[0].total, 10) || 0;

    res.json({
      data: listResult.rows,
      pagination: { limit, offset, total },
    });
  })
);

// Single conversation with all messages (for admin conversation detail)
app.get(
  '/api/admin/customers/:id/conversations/:conversationId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id, conversationId } = req.params;

    const convResult = await query(
      `
        SELECT 
          c.id,
          c.customer_id,
          c.lead_name,
          c.lead_phone,
          c.lead_email,
          c.status,
          c.message_count,
          c.ai_response_count,
          c.last_message_at,
          c.created_at,
          ai.agent_name AS ai_agent_name
        FROM conversations c
        LEFT JOIN ai_settings ai ON ai.customer_id = c.customer_id
        WHERE c.id = $1 AND c.customer_id = $2
      `,
      [conversationId, id]
    );

    if (convResult.rowCount === 0) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const messagesResult = await query(
      `
        SELECT id, conversation_id, direction, sender, content, created_at
        FROM messages
        WHERE conversation_id = $1
        ORDER BY created_at ASC
      `,
      [conversationId]
    );

    res.json({
      conversation: convResult.rows[0],
      messages: messagesResult.rows,
    });
  })
);

// Overall admin/system health
app.get(
  '/api/admin/health',
  asyncHandler(async (_req, res) => {
    const [dbHealth, redisPing] = await Promise.all([
      checkDbHealth(),
      redis
        .ping()
        .then((reply) => ({ healthy: reply === 'PONG' }))
        .catch((error) => ({ healthy: false, error: error.message })),
    ]);

    const smsProviders = {
      twilio: {
        configured:
          !!process.env.TWILIO_ACCOUNT_SID &&
          !!process.env.TWILIO_AUTH_TOKEN &&
          !!process.env.TWILIO_MESSAGING_SERVICE_SID,
        healthy: false,
      },
      fonecloud: {
        configured:
          !!process.env.FONECLOUD_API_BASE_URL && !!process.env.FONECLOUD_TOKEN,
        healthy: false,
      },
    };

    // Twilio health – perform a lightweight authenticated call when configured
    if (smsProviders.twilio.configured) {
      try {
        const twilioClient = Twilio(
          process.env.TWILIO_ACCOUNT_SID,
          process.env.TWILIO_AUTH_TOKEN
        );
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        await twilioClient.api.v2010.accounts(accountSid).fetch();
        smsProviders.twilio.healthy = true;
      } catch (error) {
        smsProviders.twilio.healthy = false;
        smsProviders.twilio.error = error.message;
      }
    }

    // Fonecloud health – basic connectivity check when configured
    if (smsProviders.fonecloud.configured) {
      try {
        const baseUrl = process.env.FONECLOUD_API_BASE_URL;
        const url = new URL(baseUrl);
        const res = await fetch(url.toString(), { method: 'HEAD' });
        smsProviders.fonecloud.healthy = res.ok;
        if (!res.ok) {
          smsProviders.fonecloud.error = `HTTP ${res.status}`;
        }
      } catch (error) {
        smsProviders.fonecloud.healthy = false;
        smsProviders.fonecloud.error = error.message;
      }
    }

    let stripeStatus = { configured: !!process.env.STRIPE_SECRET_KEY, healthy: false };
    if (process.env.STRIPE_SECRET_KEY) {
      try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        await stripe.balance.retrieve();
        stripeStatus.healthy = true;
      } catch (error) {
        stripeStatus.healthy = false;
        stripeStatus.error = error.message;
      }
    }

    // AI providers – report configured/healthy; run one warm path check if any provider is default
    const openai = {
      configured: !!process.env.OPENAI_API_KEY,
      healthy: !!process.env.OPENAI_API_KEY,
    };
    const gemini = {
      configured: !!process.env.GEMINI_API_KEY,
      healthy: false,
    };
    const groq = {
      configured: !!process.env.GROQ_API_KEY,
      healthy: !!process.env.GROQ_API_KEY,
    };

    // Warm path check: ensures default provider (OpenAI when set) can generate a response
    const hasAnyProvider =
      process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY;
    if (hasAnyProvider) {
      try {
        const testCustomerId = -1;
        const testConversationId = -1;
        await generateResponse(testCustomerId, testConversationId, '[HEALTHCHECK] Check-in');
        if (gemini.configured) gemini.healthy = true;
      } catch (error) {
        if (gemini.configured) {
          gemini.healthy = false;
          gemini.error = error.message;
        }
      }
    }

    res.json({
      status: dbHealth.healthy && redisPing.healthy ? 'ok' : 'degraded',
      db: dbHealth,
      redis: redisPing,
      sms: smsProviders,
      stripe: stripeStatus,
      openai,
      gemini,
      groq,
    });
  })
);

// Global default SMS provider for new customers
app.get(
  '/api/admin/sms-default',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const result = await query(
      `SELECT value FROM system_settings WHERE key = 'default_sms_provider' LIMIT 1`,
      []
    );
    const raw = result.rows[0]?.value || 'twilio';
    const provider = raw === 'fonecloud' ? 'fonecloud' : 'twilio';
    res.json({ provider });
  })
);

app.put(
  '/api/admin/sms-default',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { provider } = req.body || {};

    if (!provider || !['twilio', 'fonecloud'].includes(provider)) {
      return res
        .status(400)
        .json({ error: "Invalid provider. Must be 'twilio' or 'fonecloud'." });
    }

    await query(
      `
        INSERT INTO system_settings (key, value)
        VALUES ('default_sms_provider', $1)
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value,
            updated_at = NOW()
      `,
      [provider]
    );

    res.json({ provider });
  })
);

// Global default AI models for new clients (used when per-client override is not set)
app.get(
  '/api/admin/ai-default',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const result = await query(
      `SELECT key, value FROM system_settings WHERE key IN ('default_gemini_model', 'default_groq_model', 'default_openai_model')`,
      []
    );
    const map = {};
    for (const row of result.rows) {
      map[row.key] = row.value;
    }
    res.json({
      gemini_model: map.default_gemini_model || 'gemini-2.5-flash',
      groq_model: map.default_groq_model || 'llama-3.1-8b-instant',
      openai_model: map.default_openai_model || 'gpt-4o-mini',
    });
  })
);

app.put(
  '/api/admin/ai-default',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { gemini_model, groq_model, openai_model } = req.body || {};
    const clampModel = (s) =>
      typeof s === 'string' ? s.trim().slice(0, 120) : null;
    const gemini = clampModel(gemini_model) || 'gemini-2.5-flash';
    const groq = clampModel(groq_model) || 'llama-3.1-8b-instant';
    const openai = clampModel(openai_model) || 'gpt-4o-mini';

    await query(
      `
        INSERT INTO system_settings (key, value)
        VALUES ('default_gemini_model', $1), ('default_groq_model', $2), ('default_openai_model', $3)
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value, updated_at = NOW()
      `,
      [gemini, groq, openai]
    );
    res.json({ gemini_model: gemini, groq_model: groq, openai_model: openai });
  })
);

// Global dashboard metrics configuration
app.get(
  '/api/admin/dashboard-metrics',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const result = await query(
      `SELECT value FROM system_settings WHERE key = 'dashboard_minutes_saved_per_message' LIMIT 1`,
      []
    );
    const raw = Number.parseInt(result.rows[0]?.value || '2', 10);
    const minutesSavedPerMessage = Number.isFinite(raw) ? Math.max(1, Math.min(raw, 60)) : 2;
    res.json({
      minutes_saved_per_message: minutesSavedPerMessage,
    });
  })
);

// Email accounts (OAuth) visibility and control for a customer
app.get(
  '/api/admin/customers/:id/email-accounts',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await query(
      `
        SELECT
          id,
          provider,
          email_address,
          display_name,
          status,
          last_sync_at,
          created_at,
          updated_at
        FROM email_accounts
        WHERE customer_id = $1
        ORDER BY created_at DESC
      `,
      [id]
    );

    res.json({ data: result.rows });
  })
);

app.patch(
  '/api/admin/email-accounts/:accountId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { accountId } = req.params;
    const { status } = req.body || {};

    if (status && !['active', 'disabled', 'error'].includes(status)) {
      return res.status(400).json({
        error: "Invalid status. Must be 'active', 'disabled', or 'error'.",
      });
    }

    const fields = [];
    const params = [];
    let idx = 1;

    if (status !== undefined) {
      fields.push(`status = $${idx++}`);
      params.push(status);
      if (status === 'disabled') {
        fields.push(`access_token = NULL`);
        fields.push(`refresh_token = NULL`);
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    params.push(accountId);

    const result = await query(
      `
        UPDATE email_accounts
        SET ${fields.join(', ')}, updated_at = NOW()
        WHERE id = $${idx}
        RETURNING id, provider, email_address, status, last_sync_at, created_at, updated_at
      `,
      params
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Email account not found' });
    }

    res.json({
      success: true,
      account: result.rows[0],
    });
  })
);

// Store connections (WooCommerce / Shopify) CRUD for a customer
app.get(
  '/api/admin/customers/:id/store-connections',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await query(
      `
        SELECT
          sc.id,
          sc.platform,
          sc.store_name,
          sc.store_domain,
          sc.status,
          sc.support_emails,
          sc.last_sync_at,
          sc.created_at,
          sc.updated_at
        FROM store_connections sc
        WHERE sc.customer_id = $1
        ORDER BY sc.created_at DESC
      `,
      [id]
    );

    res.json({ data: result.rows });
  })
);

app.post(
  '/api/admin/customers/:id/store-connections',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { platform, store_name, store_domain, credentials, support_emails } = req.body || {};

    if (!platform || !['woo', 'shopify'].includes(platform)) {
      return res
        .status(400)
        .json({ error: "platform must be 'woo' or 'shopify'" });
    }

    if (!store_domain || typeof store_domain !== 'string') {
      return res.status(400).json({ error: 'store_domain is required' });
    }

    // Enforce per-customer max_store_connections limit when configured
    const customerResult = await query(
      `
        SELECT max_store_connections
        FROM customers
        WHERE id = $1
      `,
      [id]
    );

    if (customerResult.rowCount === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const maxStoreConnections = customerResult.rows[0].max_store_connections;

    if (typeof maxStoreConnections === 'number') {
      const countResult = await query(
        `
          SELECT COUNT(*) AS total
          FROM store_connections
          WHERE customer_id = $1
        `,
        [id]
      );
      const total = parseInt(countResult.rows[0].total, 10) || 0;
      if (total >= maxStoreConnections) {
        return res.status(400).json({
          error: `Customer has reached the maximum number of store connections (${maxStoreConnections})`,
        });
      }
    }

    const safeCredentials =
      credentials && typeof credentials === 'object' ? credentials : {};

    let safeSupportEmails = [];
    if (Array.isArray(support_emails)) {
      safeSupportEmails = support_emails.filter(
        (value) => typeof value === 'string' && value.trim().length > 0
      );
    } else if (typeof support_emails === 'string') {
      safeSupportEmails = support_emails
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }

    const result = await query(
      `
        INSERT INTO store_connections (
          customer_id,
          platform,
          store_name,
          store_domain,
          credentials,
          status,
          support_emails
        )
        VALUES ($1, $2, $3, $4, $5, 'active', $6)
        RETURNING *
      `,
      [id, platform, store_name || null, store_domain.trim(), safeCredentials, safeSupportEmails]
    );

    res.status(201).json(result.rows[0]);
  })
);

app.put(
  '/api/admin/store-connections/:connectionId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { connectionId } = req.params;
    const { store_name, store_domain, status, credentials, support_emails } = req.body || {};

    const fields = [];
    const params = [];
    let idx = 1;

    if (store_name !== undefined) {
      fields.push(`store_name = $${idx++}`);
      params.push(store_name || null);
    }
    if (store_domain !== undefined) {
      fields.push(`store_domain = $${idx++}`);
      params.push(store_domain || null);
    }
    if (status !== undefined) {
      fields.push(`status = $${idx++}`);
      params.push(status || 'active');
    }
    if (credentials !== undefined) {
      fields.push(`credentials = $${idx++}`);
      params.push(
        credentials && typeof credentials === 'object' ? credentials : {}
      );
    }

    if (support_emails !== undefined) {
      let safeSupportEmails = [];
      if (Array.isArray(support_emails)) {
        safeSupportEmails = support_emails.filter(
          (value) => typeof value === 'string' && value.trim().length > 0
        );
      } else if (typeof support_emails === 'string') {
        safeSupportEmails = support_emails
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
      }
      fields.push(`support_emails = $${idx++}`);
      params.push(safeSupportEmails);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    params.push(connectionId);

    const result = await query(
      `
        UPDATE store_connections
        SET ${fields.join(', ')}, updated_at = NOW()
        WHERE id = $${idx}
        RETURNING *
      `,
      params
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Store connection not found' });
    }

    res.json(result.rows[0]);
  })
);

app.delete(
  '/api/admin/store-connections/:connectionId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { connectionId } = req.params;
    const result = await query(
      `
        DELETE FROM store_connections
        WHERE id = $1
        RETURNING id
      `,
      [connectionId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Store connection not found' });
    }

    res.status(204).end();
  })
);

app.put(
  '/api/admin/dashboard-metrics',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const raw = Number(
      req.body?.minutes_saved_per_message ??
        req.body?.minutesSavedPerMessage
    );

    if (!Number.isFinite(raw)) {
      return res.status(400).json({
        error: 'minutes_saved_per_message must be a number between 1 and 60',
      });
    }

    const minutesSavedPerMessage = Math.max(1, Math.min(Math.round(raw), 60));

    await query(
      `
        INSERT INTO system_settings (key, value)
        VALUES ('dashboard_minutes_saved_per_message', $1)
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value,
            updated_at = NOW()
      `,
      [String(minutesSavedPerMessage)]
    );

    logInfo('Updated dashboard metrics config', { minutesSavedPerMessage });
    res.json({
      minutes_saved_per_message: minutesSavedPerMessage,
    });
  })
);

// Test a single store connection (basic health check)
app.post(
  '/api/admin/store-connections/:connectionId/test',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { connectionId } = req.params;

    const result = await query(
      `
        SELECT *
        FROM store_connections
        WHERE id = $1
        LIMIT 1
      `,
      [connectionId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Store connection not found' });
    }

    const connection = result.rows[0];

    if (connection.status !== 'active') {
      return res.status(400).json({
        error: 'Store connection is inactive',
      });
    }

    try {
      const { createShopIntegrationFromConnection } = await import('../services/shopIntegration.mjs');
      const integration = createShopIntegrationFromConnection(connection);

      // Make a very small call depending on platform
      if (connection.platform === 'woo') {
        await integration.fetchProducts({ page: 1, perPage: 1 });
      } else if (connection.platform === 'shopify') {
        await integration.fetchProducts({ limit: 1 });
      }

      res.json({ success: true, status: 'ok' });
    } catch (error) {
      res.status(200).json({
        success: false,
        status: 'error',
        error: error?.message || 'Unknown error',
      });
    }
  })
);

// Trigger sync for a store connection (enqueue jobs)
app.post(
  '/api/admin/store-connections/:connectionId/trigger-sync',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { connectionId } = req.params;
    const { full = false } = req.body || {};

    const result = await query(
      `
        SELECT id, customer_id, status
        FROM store_connections
        WHERE id = $1
        LIMIT 1
      `,
      [connectionId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Store connection not found' });
    }

    const row = result.rows[0];

    if (row.status !== 'active') {
      return res.status(400).json({ error: 'Store connection is inactive' });
    }

    const customerId = row.customer_id;

    const { enqueueJob } = await import('../utils/redis.mjs');

    const basePayload = {
      storeConnectionId: connectionId,
      customerId,
      createdAt: Date.now(),
    };

    // For now always queue one product sync and one order sync job.
    await enqueueJob('shop_sync_queue', {
      ...basePayload,
      type: 'shop_sync_products',
      page: 1,
      perPage: full ? 100 : 50,
    });

    await enqueueJob('shop_sync_queue', {
      ...basePayload,
      type: 'shop_sync_orders',
      page: 1,
      perPage: full ? 100 : 50,
    });

    res.json({ success: true, queued: true });
  })
);

// Global demo AI configuration (Replypilot's own AI profile)
app.get(
  '/api/admin/demo-ai',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const result = await query(
      `SELECT key, value FROM system_settings WHERE key LIKE 'demo_ai_%'`,
      []
    );

    const map = {};
    for (const row of result.rows) {
      map[row.key] = row.value;
    }

    const response = {
      agent_name: map['demo_ai_agent_name'] || '',
      tone: map['demo_ai_tone'] || 'professionel',
      language: map['demo_ai_language'] || 'da',
      instructions: map['demo_ai_instructions'] || '',
      max_tokens: Number.parseInt(map['demo_ai_max_tokens'] || '500', 10) || 500,
      fallback_message:
        map['demo_ai_fallback_message'] ||
        'Tak for dit opkald. Svar gerne på denne SMS med lidt om hvad du har brug for, så vender vi tilbage hurtigst muligt.',
      primary_provider: map['demo_ai_primary_provider'] || 'groq',
      secondary_provider: map['demo_ai_secondary_provider'] || '',
    };

    res.json(response);
  })
);

app.put(
  '/api/admin/demo-ai',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const {
      agent_name,
      tone,
      language,
      instructions,
      max_tokens,
      fallback_message,
      primary_provider,
      secondary_provider,
    } = req.body || {};

    const updates = [
      ['demo_ai_agent_name', typeof agent_name === 'string' ? agent_name.slice(0, 100) : ''],
      ['demo_ai_tone', typeof tone === 'string' ? tone.slice(0, 50) : 'professionel'],
      ['demo_ai_language', language === 'en' ? 'en' : 'da'],
      [
        'demo_ai_instructions',
        typeof instructions === 'string' ? instructions.slice(0, 5000) : '',
      ],
      [
        'demo_ai_max_tokens',
        (() => {
          const v =
            typeof max_tokens === 'number'
              ? max_tokens
              : Number.parseInt(String(max_tokens || ''), 10);
          const clamped = Number.isFinite(v) ? Math.max(50, Math.min(v, 1000)) : 500;
          return String(clamped);
        })(),
      ],
      [
        'demo_ai_fallback_message',
        typeof fallback_message === 'string'
          ? fallback_message.slice(0, 1000)
          : 'Tak for dit opkald. Vi vender tilbage hurtigst muligt.',
      ],
      [
        'demo_ai_primary_provider',
        primary_provider === 'openai' ? 'openai' : primary_provider === 'groq' ? 'groq' : 'gemini',
      ],
      [
        'demo_ai_secondary_provider',
        secondary_provider === 'openai' || secondary_provider === 'gemini' || secondary_provider === 'groq'
          ? secondary_provider
          : '',
      ],
    ];

    for (const [key, value] of updates) {
      // eslint-disable-next-line no-await-in-loop
      await query(
        `
          INSERT INTO system_settings (key, value)
          VALUES ($1, $2)
          ON CONFLICT (key) DO UPDATE
          SET value = EXCLUDED.value,
              updated_at = NOW()
        `,
        [key, value]
      );
    }

    res.json({ success: true });
  })
);

// ---------- Email Management (Admin) ----------

// List all email accounts (optionally filter by customer)
app.get(
  '/api/admin/email/accounts',
  authMiddleware,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const customerId = req.query.customerId || null;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (customerId) {
      conditions.push(`ea.customer_id = $${idx++}`);
      params.push(customerId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `
        SELECT
          ea.id,
          ea.customer_id,
          c.name AS customer_name,
          ea.provider,
          ea.email_address,
          ea.display_name,
          ea.status,
          ea.sync_error,
          ea.sync_error_count,
          ea.last_sync_at,
          ea.next_sync_at,
          ea.created_at
        FROM email_accounts ea
        LEFT JOIN customers c ON c.id = ea.customer_id
        ${where}
        ORDER BY ea.created_at DESC
        LIMIT 100
      `,
      params
    );

    res.json({ data: result.rows });
  })
);

// Get email account detail
app.get(
  '/api/admin/email/accounts/:id',
  authMiddleware,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await query(
      `
        SELECT ea.*, c.name AS customer_name
        FROM email_accounts ea
        LEFT JOIN customers c ON c.id = ea.customer_id
        WHERE ea.id = $1
        LIMIT 1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Email account not found' });
    }

    // Mask tokens for security
    const account = result.rows[0];
    account.access_token = account.access_token ? '***' : null;
    account.refresh_token = account.refresh_token ? '***' : null;

    res.json({ data: account });
  })
);

// Disable / re-enable an email account
app.patch(
  '/api/admin/email/accounts/:id',
  authMiddleware,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['active', 'disabled', 'error'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be active, disabled, or error.' });
    }

    const updates = { status };
    if (status === 'active') {
      // Clear error state when re-enabling
      updates.sync_error = null;
      updates.sync_error_count = 0;
    }

    const result = await query(
      `
        UPDATE email_accounts
        SET status = $1,
            sync_error = $2,
            sync_error_count = $3,
            updated_at = NOW()
        WHERE id = $4
        RETURNING id, status
      `,
      [
        updates.status,
        updates.sync_error !== undefined ? updates.sync_error : null,
        updates.sync_error_count !== undefined ? updates.sync_error_count : 0,
        id,
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Email account not found' });
    }

    res.json({ data: result.rows[0] });
  })
);

// Delete an email account permanently
app.delete(
  '/api/admin/email/accounts/:id',
  authMiddleware,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await query(
      `DELETE FROM email_accounts WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Email account not found' });
    }

    res.status(204).end();
  })
);

// List email conversations across all customers (admin overview)
app.get(
  '/api/admin/email/conversations',
  authMiddleware,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const customerId = req.query.customerId || null;
    const status = req.query.status || null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = parseInt(req.query.offset, 10) || 0;

    const conditions = ["c.channel = 'email'"];
    const params = [];
    let idx = 1;

    if (customerId) {
      conditions.push(`c.customer_id = $${idx++}`);
      params.push(customerId);
    }
    if (status) {
      conditions.push(`c.status = $${idx++}`);
      params.push(status);
    }

    params.push(limit, offset);

    const result = await query(
      `
        SELECT
          c.id,
          c.customer_id,
          cu.name AS customer_name,
          c.email_subject,
          c.lead_name,
          c.lead_email,
          c.status,
          c.message_count,
          c.ai_response_count,
          c.last_message_at,
          c.created_at,
          ea.email_address AS account_email
        FROM conversations c
        LEFT JOIN customers cu ON cu.id = c.customer_id
        LEFT JOIN email_accounts ea ON ea.id = c.email_account_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY c.last_message_at DESC NULLS LAST
        LIMIT $${idx++} OFFSET $${idx++}
      `,
      params
    );

    res.json({ data: result.rows });
  })
);

// List email drafts across all customers (admin overview)
app.get(
  '/api/admin/email/drafts',
  authMiddleware,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const customerId = req.query.customerId || null;
    const status = req.query.status || null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = parseInt(req.query.offset, 10) || 0;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (customerId) {
      conditions.push(`d.customer_id = $${idx++}`);
      params.push(customerId);
    }
    if (status) {
      conditions.push(`d.status = $${idx++}`);
      params.push(status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const result = await query(
      `
        SELECT
          d.id,
          d.customer_id,
          cu.name AS customer_name,
          d.subject,
          d.to_addresses,
          d.status,
          d.ai_model,
          d.sent_at,
          d.created_at,
          ea.email_address AS account_email
        FROM email_drafts d
        LEFT JOIN customers cu ON cu.id = d.customer_id
        LEFT JOIN email_accounts ea ON ea.id = d.email_account_id
        ${where}
        ORDER BY d.created_at DESC
        LIMIT $${idx++} OFFSET $${idx++}
      `,
      params
    );

    res.json({ data: result.rows });
  })
);

// Email system stats (admin dashboard)
app.get(
  '/api/admin/email/stats',
  authMiddleware,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const result = await query(
      `
        SELECT
          (SELECT COUNT(*) FROM email_accounts WHERE status = 'active') AS active_accounts,
          (SELECT COUNT(*) FROM email_accounts WHERE status = 'error') AS error_accounts,
          (SELECT COUNT(*) FROM conversations WHERE channel = 'email' AND status = 'active') AS open_conversations,
          (SELECT COUNT(*) FROM email_drafts WHERE status = 'draft') AS pending_drafts,
          (SELECT COUNT(*) FROM email_drafts WHERE status = 'sent') AS sent_drafts,
          (SELECT COUNT(*) FROM email_messages WHERE created_at > NOW() - INTERVAL '24 hours') AS messages_24h
      `,
      []
    );

    res.json({ data: result.rows[0] });
  })
);

// 404 handler for admin routes
app.use('/api/admin', (req, res) => {
  res.status(404).json({ error: 'Admin route not found' });
});

// Central error handler
app.use(errorHandler);

// Ensure schema (including users.role and seed admin user) before accepting traffic
initDb()
  .then(() => {
    app.listen(port, () => {
      logInfo(`Admin API server running on port ${port}`, { port });
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database for Admin API', err);
    process.exit(1);
  });

