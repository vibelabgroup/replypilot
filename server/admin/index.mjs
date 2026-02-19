import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import Stripe from 'stripe';
import { logInfo } from '../utils/logger.mjs';
import { authMiddleware, requireAdmin, setSessionCookie, clearSessionCookie } from '../middleware/auth.mjs';
import { errorHandler, asyncHandler, createUnauthorizedError } from '../middleware/errorHandler.mjs';
import { login as authLogin, logout as authLogout } from '../services/authService.mjs';
import { query, checkDbHealth } from '../core/db.mjs';
import { initDb } from '../db.mjs';
import { redis } from '../core/redis.mjs';
import { queueSms } from '../core/sms/gateway.mjs';

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
            ) AS twilio_phone_number
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

// Update SMS provider configuration for a customer
app.patch(
  '/api/admin/customers/:id/sms',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { provider, fonecloud_sender_id } = req.body || {};

    if (provider && !['twilio', 'fonecloud'].includes(provider)) {
      res.status(400).json({
        error: "Invalid provider. Must be 'twilio' or 'fonecloud'.",
      });
      return;
    }

    const result = await query(
      `
        UPDATE customers
        SET
          sms_provider = COALESCE($1, sms_provider),
          fonecloud_sender_id = COALESCE($2, fonecloud_sender_id),
          updated_at = NOW()
        WHERE id = $3
        RETURNING id, email, name, sms_provider, fonecloud_sender_id
      `,
      [provider || null, fonecloud_sender_id || null, id]
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
      },
      fonecloud: {
        configured:
          !!process.env.FONECLOUD_API_BASE_URL && !!process.env.FONECLOUD_TOKEN,
      },
    };

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

    res.json({
      status: dbHealth.healthy && redisPing.healthy ? 'ok' : 'degraded',
      db: dbHealth,
      redis: redisPing,
      sms: smsProviders,
      stripe: stripeStatus,
    });
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

