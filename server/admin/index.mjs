import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import Stripe from 'stripe';
import Twilio from 'twilio';
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

// CORS configuration – admin frontend only
const adminFrontendOrigin = process.env.ADMIN_FRONTEND_URL || process.env.FRONTEND_URL || 'http://localhost:5173';

app.use(
  cors({
    origin: adminFrontendOrigin,
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json());

// Attach req.auth using shared middleware
app.use(authMiddleware);

// ---- Auth routes (admin-scoped) ----

app.post(
  '/api/admin/auth/login',
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
    } = req.body || {};

    const clamp = (s, max) =>
      typeof s === 'string' ? s.slice(0, max) : s ?? null;

    const aiData = {
      agent_name: clamp(agent_name, 100),
      tone: clamp(tone, 50),
      language: clamp(language, 20),
      custom_instructions: clamp(custom_instructions, 5000),
      max_message_length:
        typeof max_message_length === 'number'
          ? Math.max(50, Math.min(max_message_length, 500))
          : null,
    };

    const result = await query(
      `
        INSERT INTO ai_settings (
          customer_id,
          agent_name,
          tone,
          language,
          custom_instructions,
          max_message_length
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (customer_id) DO UPDATE
        SET
          agent_name = EXCLUDED.agent_name,
          tone = EXCLUDED.tone,
          language = EXCLUDED.language,
          custom_instructions = EXCLUDED.custom_instructions,
          max_message_length = EXCLUDED.max_message_length,
          updated_at = NOW()
        RETURNING
          customer_id,
          agent_name,
          tone,
          language,
          custom_instructions,
          max_message_length;
      `,
      [
        id,
        aiData.agent_name,
        aiData.tone,
        aiData.language,
        aiData.custom_instructions,
        aiData.max_message_length,
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
        SELECT c.id, c.customer_id, c.lead_name, c.lead_phone, c.lead_email, c.status,
               c.message_count, c.ai_response_count, c.last_message_at, c.created_at
        FROM conversations c
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

    // Gemini / AI health – warm path check
    const gemini = {
      configured: !!process.env.GEMINI_API_KEY,
      healthy: false,
    };

    if (gemini.configured) {
      try {
        // Minimal, non-persistent test call
        const testCustomerId = -1;
        const testConversationId = -1;
        await generateResponse(testCustomerId, testConversationId, '[HEALTHCHECK] Check-in');
        gemini.healthy = true;
      } catch (error) {
        gemini.healthy = false;
        gemini.error = error.message;
      }
    }

    res.json({
      status: dbHealth.healthy && redisPing.healthy ? 'ok' : 'degraded',
      db: dbHealth,
      redis: redisPing,
      sms: smsProviders,
      stripe: stripeStatus,
      gemini,
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

