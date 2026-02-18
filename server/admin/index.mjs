import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import Stripe from 'stripe';
import { logInfo } from '../utils/logger.mjs';
import { authMiddleware, requireAdmin, setSessionCookie, clearSessionCookie } from '../middleware/auth.mjs';
import { errorHandler, asyncHandler, createUnauthorizedError } from '../middleware/errorHandler.mjs';
import { login as authLogin, logout as authLogout } from '../services/authService.mjs';
import { query, checkDbHealth } from '../core/db.mjs';
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

    const [customerResult, usageResult] = await Promise.all([
      query(
        `
          SELECT 
            c.*,
            cs.company_name,
            cs.website,
            cs.industry
          FROM customers c
          LEFT JOIN company_settings cs ON cs.customer_id = c.id
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

    res.json({
      customer,
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

app.listen(port, () => {
  logInfo(`Admin API server running on port ${port}`, { port });
});

