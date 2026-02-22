import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import cors from "cors";
import Stripe from "stripe";
import cookieParser from "cookie-parser";
import { logInfo, logWarn, logError } from "./logger.mjs";
import { handleIncomingMessage, provisionNumber } from "./sms/gateway.mjs";
import { handleIncomingVoiceDemo } from "./services/twilioService.mjs";
import { generateDemoLiveResponse, analyzeCompanyProfile } from "./services/aiService.mjs";
import { getLeads } from "./services/conversationService.mjs";
import { getNotificationPreferences, updateNotificationPreferences } from "./services/settingsService.mjs";
import { requestPasswordReset, resetPassword as resetPasswordWithToken } from "./services/authService.mjs";
import { sendEmail } from "./services/notificationService.mjs";
import { validate, notificationPreferencesSchema } from "./utils/validators.mjs";
import {
  initDb,
  pool,
  recordStripeEventIfNew,
  upsertCustomer,
  upsertSubscriptionFromStripeObject,
  findActiveSubscriptionByEmail,
  getSettingsByCustomerId,
  upsertCompanySettings,
  upsertAiSettings,
} from "./db.mjs";
import {
  initAuthDb,
  hashPassword,
  verifyPassword,
  createSession,
  getSession,
  destroySession,
  generateSessionToken,
} from "./auth.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 4242;

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const priceId = process.env.STRIPE_PRICE_ID;
const frontendUrl = process.env.FRONTEND_URL;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

if (!stripeSecretKey) {
  logError("Missing STRIPE_SECRET_KEY environment variable.");
  process.exit(1);
}

if (!priceId) {
  logError("Missing STRIPE_PRICE_ID environment variable.");
  process.exit(1);
}

if (!frontendUrl) {
  logError("Missing FRONTEND_URL environment variable.");
  process.exit(1);
}

if (!webhookSecret) {
  logError("Missing STRIPE_WEBHOOK_SECRET environment variable.");
  process.exit(1);
}

const stripe = new Stripe(stripeSecretKey);

app.use(
  cors({
    origin: frontendUrl,
    credentials: true,
  })
);

app.use(cookieParser());

async function sendPasswordResetEmail(email, token) {
  if (!token) return;
  const baseUrl = (frontendUrl || "").replace(/\/$/, "");
  const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
  await sendEmail(
    email,
    "Nulstil din kodeord",
    `
      <h2>Nulstil kodeord</h2>
      <p>Vi har modtaget en anmodning om at nulstille din kode.</p>
      <p><a href="${resetUrl}">Klik her for at vælge et nyt kodeord</a></p>
      <p>Linket udløber om 1 time.</p>
      <p>Hvis du ikke har bedt om dette, kan du ignorere denne email.</p>
    `
  );
}

function setSessionCookie(res, token, expiresAt) {
  res.cookie("rp_session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    expires: expiresAt,
  });
}

async function authMiddleware(req, res, next) {
  const token = req.cookies?.rp_session;
  if (!token) {
    req.auth = null;
    return next();
  }

  const session = await getSession(token);
  if (!session) {
    req.auth = null;
    return next();
  }

  req.auth = {
    userId: session.user_id,
    customerId: session.customer_id,
  };
  next();
}

app.use(express.json());
app.use(authMiddleware);

function requireAuth(req, res, next) {
  if (!req.auth) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

const entitlementEnforcementEnabled =
  process.env.ENABLE_ENTITLEMENT_ENFORCEMENT !== "false";
const onboardingFirstFlowEnabled =
  process.env.ENABLE_ONBOARDING_FIRST_FLOW !== "false";

async function getCustomerSubscriptionSnapshot(customerId) {
  const customerResult = await pool.query(
    `
      SELECT id, email, name, phone, stripe_customer_id
      FROM customers
      WHERE id = $1
      LIMIT 1;
    `,
    [customerId]
  );
  const customer = customerResult.rows[0] || null;
  if (!customer) {
    return { customer: null, subscription: null };
  }
  const subscription = await findActiveSubscriptionByEmail(customer.email);
  return { customer, subscription };
}

async function requirePaidSubscription(req, res, next) {
  if (!entitlementEnforcementEnabled) {
    return next();
  }
  try {
    if (!req.auth?.customerId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { subscription } = await getCustomerSubscriptionSnapshot(req.auth.customerId);
    if (!subscription) {
      return res.status(402).json({
        error: "Payment required",
        code: "PAYMENT_REQUIRED",
      });
    }
    req.entitlement = {
      hasActiveSubscription: true,
      subscription,
    };
    return next();
  } catch (err) {
    logError("Error in requirePaidSubscription middleware", { error: err });
    return res.status(500).json({ error: "Unable to verify subscription" });
  }
}

// Stripe webhook endpoint – use raw body for signature verification
app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    logError("Webhook signature verification failed", { error: err.message });
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const isNew = await recordStripeEventIfNew(event.id, event.type, event);
  if (!isNew) {
    // Duplicate delivery – acknowledge without re-processing
    return res.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const email = session.customer_email;
        const name = session.metadata?.customer_name;
        const phone = session.metadata?.customer_phone;
        const stripeCustomerId = session.customer;
        const metadataCustomerId = Number.parseInt(session.metadata?.customer_id, 10);
        let customer = null;

        if (Number.isFinite(metadataCustomerId)) {
          const byId = await pool.query(
            `SELECT * FROM customers WHERE id = $1 LIMIT 1`,
            [metadataCustomerId]
          );
          customer = byId.rows[0] || null;
          if (customer) {
            await pool.query(
              `
                UPDATE customers
                SET
                  stripe_customer_id = COALESCE($1, stripe_customer_id),
                  name = COALESCE($2, name),
                  phone = COALESCE($3, phone),
                  updated_at = NOW()
                WHERE id = $4
              `,
              [stripeCustomerId || null, name || null, phone || null, customer.id]
            );
          }
        }

        if (!customer && email) {
          customer = await upsertCustomer({
            email,
            name,
            phone,
            stripeCustomerId,
          });
        }

        if (!customer) {
          throw new Error("Could not resolve customer for checkout.session.completed");
        }

        // Ensure there is a user for this customer/email
        try {
          const randomPassword = generateSessionToken();
          const passwordHash = await hashPassword(randomPassword);
          await pool.query(
            `
              INSERT INTO users (customer_id, email, password_hash)
              VALUES ($1, $2, $3)
              ON CONFLICT (email) DO NOTHING;
            `,
            [customer.id, email, passwordHash]
          );
        } catch (err) {
          logError("Failed to ensure user for checkout.session.completed", {
            error: err,
          });
        }

        if (session.subscription) {
          // Fetch full subscription for accurate period/status data
          const stripeSub = await stripe.subscriptions.retrieve(
            session.subscription
          );
          await upsertSubscriptionFromStripeObject(customer.id, stripeSub);
        }

        logInfo("checkout_completed", { email, customerId: customer.id });
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const stripeSub = event.data.object;
        const stripeCustomerId = stripeSub.customer;

        // Look up customer by stripe_customer_id
        const { rows } = await pool.query(
          "SELECT * FROM customers WHERE stripe_customer_id = $1 LIMIT 1",
          [stripeCustomerId]
        );

        let customer = rows[0];
        if (!customer && stripeCustomerId) {
          // Fallback: fetch from Stripe to get email
          const stripeCustomer = await stripe.customers.retrieve(
            stripeCustomerId
          );
          customer = await upsertCustomer({
            email: stripeCustomer.email,
            name: stripeCustomer.name,
            phone: stripeCustomer.phone,
            stripeCustomerId,
          });
        }

        if (customer) {
          await upsertSubscriptionFromStripeObject(customer.id, stripeSub);
        }

        logInfo("Synced subscription event", { type: event.type });
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        logWarn("Invoice payment failed", {
          id: invoice.id,
          customer: invoice.customer,
        });
        // Subscription status will typically be reflected in customer.subscription.updated
        break;
      }
      default:
        logInfo("Unhandled Stripe event type", { type: event.type });
    }

    res.json({ received: true });
  } catch (err) {
    logError("Error handling webhook event", { eventId: event.id, error: err });
    // Let Stripe retry on error
    res.status(500).send("Webhook handler error");
  }
});

// Twilio incoming SMS webhook (form-urlencoded)
app.post("/webhook/twilio", express.urlencoded({ extended: true }), async (req, res) => {
  try {
    await handleIncomingMessage("twilio", req.body);
    res.type("text/xml").send("<Response></Response>");
  } catch (err) {
    logError("Twilio webhook error", { error: err?.message });
    res.status(500).type("text/xml").send("<Response></Response>");
  }
});

// Twilio incoming VOICE webhook for demo number (missed call -> AI SMS)
app.post(
  "/webhook/twilio-voice-demo",
  express.urlencoded({ extended: true }),
  async (req, res) => {
    try {
      await handleIncomingVoiceDemo(req.body);
    } catch (err) {
      logError("Twilio voice demo webhook error", { error: err?.message });
      // We still return TwiML so caller is not left hanging
    }

    // Always respond with simple TwiML so the call ends cleanly
    const twiml =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      "<Response>" +
      '<Say language="da-DK" voice="alice">' +
      "Tak for dit opkald. Du modtager straks en SMS fra vores AI-receptionist." +
      "</Say>" +
      "<Hangup/>" +
      "</Response>";

    res.type("text/xml").send(twiml);
  }
);

// Auth routes
app.post("/api/auth/signup", async (req, res) => {
  const { email, password, name, phone } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const passwordHash = await hashPassword(password);

    // Ensure a customer exists for this email
    const customer = await upsertCustomer({
      email,
      name: name || "",
      phone: phone || "",
      stripeCustomerId: null,
    });

    const userResult = await pool.query(
      `
        INSERT INTO users (customer_id, email, password_hash)
        VALUES ($1, $2, $3)
        ON CONFLICT (email) DO UPDATE
        SET
          customer_id = COALESCE(users.customer_id, EXCLUDED.customer_id),
          password_hash = EXCLUDED.password_hash,
          updated_at = NOW()
        RETURNING id, customer_id, email;
      `,
      [customer.id, email, passwordHash]
    );

    const user = userResult.rows[0];
    const session = await createSession(user.id);
    setSessionCookie(res, session.token, session.expiresAt);

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        customerId: user.customer_id,
      },
    });
  } catch (err) {
    logError("Signup error", { error: err });
    return res.status(500).json({ error: "Unable to sign up" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const result = await pool.query(
      "SELECT id, customer_id, email, password_hash FROM users WHERE email = $1 LIMIT 1",
      [email]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const session = await createSession(user.id);
    setSessionCookie(res, session.token, session.expiresAt);

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        customerId: user.customer_id,
      },
    });
  } catch (err) {
    logError("Login error", { error: err });
    return res.status(500).json({ error: "Unable to log in" });
  }
});

app.post("/api/auth/logout", async (req, res) => {
  const token = req.cookies?.rp_session;
  if (token) {
    await destroySession(token);
  }
  res.clearCookie("rp_session");
  res.status(204).end();
});

app.post("/api/auth/reset-password-request", async (req, res) => {
  const { email } = req.body || {};
  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    const result = await requestPasswordReset(email.trim().toLowerCase());
    if (result?.token) {
      await sendPasswordResetEmail(email.trim().toLowerCase(), result.token);
    }
    return res.json({
      success: true,
      message:
        "Hvis kontoen findes, har vi sendt et link til nulstilling af kodeord.",
    });
  } catch (err) {
    logError("Reset password request failed", { error: err?.message });
    return res.status(500).json({ error: "Unable to process reset request" });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) {
    return res.status(400).json({ error: "Token and password are required" });
  }
  if (typeof password !== "string" || password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  try {
    await resetPasswordWithToken(String(token), String(password));
    return res.json({ success: true, message: "Password updated successfully" });
  } catch (err) {
    const status = err?.statusCode || 400;
    return res.status(status).json({ error: err?.message || "Unable to reset password" });
  }
});

const respondWithProfile = async (req, res) => {
  try {
    const { userId, customerId } = req.auth;

    const userResult = await pool.query(
      `
        SELECT id, email, customer_id
        FROM users
        WHERE id = $1
        LIMIT 1;
      `,
      [userId]
    );

    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const { customer, subscription } = await getCustomerSubscriptionSnapshot(customerId);

    res.json({
      user,
      customer,
      subscription,
      hasActiveSubscription: Boolean(subscription),
    });
  } catch (err) {
    logError("Error in /api/me", { error: err });
    res.status(500).json({ error: "Unable to load profile" });
  }
};

app.get("/api/me", requireAuth, respondWithProfile);
app.get("/api/auth/me", requireAuth, respondWithProfile);

app.get("/api/settings", requireAuth, async (req, res) => {
  try {
    const { customerId } = req.auth;
    const settings = await getSettingsByCustomerId(customerId);
    res.json(settings);
  } catch (err) {
    logError("Error in GET /api/settings", { error: err });
    res.status(500).json({ error: "Unable to load settings" });
  }
});

app.get("/api/settings/notifications", requireAuth, async (req, res) => {
  try {
    const { customerId, userId } = req.auth;
    const preferences = await getNotificationPreferences(customerId, userId);
    res.json(preferences);
  } catch (err) {
    logError("Error in GET /api/settings/notifications", { error: err });
    res.status(500).json({ error: "Unable to load notification settings" });
  }
});

app.put("/api/settings/notifications", requireAuth, requirePaidSubscription, async (req, res) => {
  try {
    const { customerId, userId } = req.auth;
    const payload = validate(notificationPreferencesSchema, req.body || {});
    const preferences = await updateNotificationPreferences(customerId, userId, payload);
    res.json(preferences);
  } catch (err) {
    logError("Error in PUT /api/settings/notifications", { error: err });
    const status = err?.statusCode || 500;
    res.status(status).json({
      error: err?.message || "Unable to update notification settings",
      details: err?.errors || undefined,
    });
  }
});

app.post("/api/onboarding/draft", requireAuth, async (req, res) => {
  try {
    const { customerId, userId } = req.auth;
    const payload = req.body || {};
    const companyPayload = payload.company || {};
    const aiPayload = payload.ai || {};
    const notifPayload = payload.notifications || {};

    const companyData = {
      company_name: companyPayload.companyName ?? companyPayload.company_name ?? null,
      phone_number: companyPayload.phoneNumber ?? companyPayload.phone_number ?? null,
      website: companyPayload.website ?? null,
      industry: companyPayload.industry ?? null,
      address: companyPayload.address ?? null,
      opening_hours: companyPayload.openingHours ?? companyPayload.opening_hours ?? null,
      forwarding_number: companyPayload.forwardingNumber ?? companyPayload.forwarding_number ?? null,
      email_forward: companyPayload.emailForward ?? companyPayload.email_forward ?? null,
      notes: companyPayload.notes ?? null,
    };

    const aiData = {
      agent_name: aiPayload.agentName ?? aiPayload.agent_name ?? null,
      tone: aiPayload.responseTone ?? aiPayload.tone ?? null,
      language: aiPayload.language ?? "da",
      custom_instructions: aiPayload.systemPrompt ?? aiPayload.custom_instructions ?? null,
      max_message_length: aiPayload.maxTokens ?? aiPayload.max_message_length ?? null,
      fallback_message: aiPayload.fallbackMessage ?? aiPayload.fallback_message ?? null,
      primary_provider: aiPayload.primaryProvider ?? aiPayload.primary_provider ?? "openai",
      secondary_provider: aiPayload.secondaryProvider ?? aiPayload.secondary_provider ?? null,
    };

    const [companySettings, aiSettings, notificationSettings] = await Promise.all([
      upsertCompanySettings(customerId, companyData),
      upsertAiSettings(customerId, aiData),
      updateNotificationPreferences(customerId, userId, {
        emailEnabled: !!notifPayload.emailEnabled,
        emailNewLead: notifPayload.emailNewLead ?? true,
        emailNewMessage: notifPayload.emailNewMessage ?? false,
        emailDailyDigest: notifPayload.emailDailyDigest ?? true,
        emailWeeklyReport: notifPayload.emailWeeklyReport ?? true,
        smsEnabled: !!notifPayload.smsEnabled,
        smsPhone: notifPayload.smsPhone || "",
        smsNewLead: notifPayload.smsNewLead ?? true,
        smsNewMessage: notifPayload.smsNewMessage ?? false,
        notifyLeadManaged: notifPayload.notifyLeadManaged ?? true,
        notifyLeadConverted: notifPayload.notifyLeadConverted ?? true,
        notifyAiFailed: notifPayload.notifyAiFailed ?? true,
        cadenceMode: notifPayload.cadenceMode || "immediate",
        cadenceIntervalMinutes: notifPayload.cadenceIntervalMinutes ?? null,
        maxNotificationsPerDay: notifPayload.maxNotificationsPerDay ?? null,
        quietHoursStart: notifPayload.quietHoursStart ?? null,
        quietHoursEnd: notifPayload.quietHoursEnd ?? null,
        timezone: notifPayload.timezone || "Europe/Copenhagen",
        digestType: notifPayload.digestType || "daily",
        digestTime: notifPayload.digestTime || "09:00",
      }),
    ]);

    logInfo("onboarding_draft_saved", {
      customerId,
      hasCompanyName: Boolean(companyData.company_name),
      hasAssistantName: Boolean(aiData.agent_name),
    });

    res.json({
      success: true,
      company: companySettings,
      ai: aiSettings,
      notifications: notificationSettings,
    });
  } catch (err) {
    logError("Error in POST /api/onboarding/draft", { error: err });
    res.status(500).json({ error: "Unable to save onboarding draft" });
  }
});

app.get("/api/leads", requireAuth, requirePaidSubscription, async (req, res) => {
  try {
    const { customerId } = req.auth;
    const limit = Math.max(1, Math.min(Number.parseInt(req.query.limit, 10) || 25, 100));
    const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);
    const qualification = typeof req.query.qualification === "string" ? req.query.qualification : undefined;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;
    const result = await getLeads(customerId, { limit, offset, qualification, search });
    res.json(result);
  } catch (err) {
    logError("Error in GET /api/leads", { error: err });
    res.status(500).json({ error: "Unable to load leads" });
  }
});

app.get("/api/leads/:id", requireAuth, requirePaidSubscription, async (req, res) => {
  try {
    const { customerId } = req.auth;
    const leadId = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(leadId)) {
      return res.status(400).json({ error: "Invalid lead ID" });
    }

    const leadResult = await pool.query(
      `SELECT l.*, c.status AS conversation_status, c.lead_phone, c.lead_name
       FROM leads l
       LEFT JOIN conversations c ON c.id = l.conversation_id
       WHERE l.id = $1 AND l.customer_id = $2
       LIMIT 1`,
      [leadId, customerId]
    );

    if (leadResult.rowCount === 0) {
      return res.status(404).json({ error: "Lead not found" });
    }

    const lead = leadResult.rows[0];
    let messages = [];
    if (lead.conversation_id) {
      const messagesResult = await pool.query(
        `SELECT id, direction, sender, content, created_at, delivery_status, delivery_error
         FROM messages
         WHERE conversation_id = $1
         ORDER BY created_at ASC`,
        [lead.conversation_id]
      );
      messages = messagesResult.rows;
    }

    res.json({
      lead,
      timeline: messages,
      conversationId: lead.conversation_id || null,
      dashboardLink: `${frontendUrl.replace(/\/$/, "")}/?leadId=${lead.id}${lead.conversation_id ? `&conversationId=${lead.conversation_id}` : ""}`,
    });
  } catch (err) {
    logError("Error in GET /api/leads/:id", { error: err });
    res.status(500).json({ error: "Unable to load lead details" });
  }
});

app.get("/api/notifications/history", requireAuth, requirePaidSubscription, async (req, res) => {
  try {
    const { customerId } = req.auth;
    const limit = Math.max(1, Math.min(Number.parseInt(req.query.limit, 10) || 50, 200));
    const result = await pool.query(
      `SELECT id, type, channel, status, payload, error_message, sent_at, created_at
       FROM notification_queue
       WHERE customer_id = $1
       ORDER BY COALESCE(sent_at, created_at) DESC
       LIMIT $2`,
      [customerId, limit]
    );

    res.json({
      notifications: result.rows,
      total: result.rowCount,
    });
  } catch (err) {
    logError("Error in GET /api/notifications/history", { error: err });
    res.status(500).json({ error: "Unable to load notification history" });
  }
});

// Phone numbers for tenant (Twilio or Fonecloud pool)
app.get("/api/phone-numbers", requireAuth, requirePaidSubscription, async (req, res) => {
  try {
    const { customerId } = req.auth;
    const cust = await pool.query(
      `SELECT sms_provider FROM customers WHERE id = $1 LIMIT 1`,
      [customerId]
    );
    const provider = cust.rows[0]?.sms_provider || "twilio";

    if (provider === "fonecloud") {
      const fn = await pool.query(
        `SELECT id, phone_number FROM fonecloud_numbers WHERE customer_id = $1 AND is_active = true`,
        [customerId]
      );
      return res.json({
        phoneNumbers: fn.rows.map((r) => ({ id: r.id, phone_number: r.phone_number })),
      });
    }

    const tn = await pool.query(
      `SELECT id, phone_number FROM twilio_numbers WHERE customer_id = $1 AND is_active = true ORDER BY created_at DESC`,
      [customerId]
    );
    res.json({
      phoneNumbers: tn.rows.map((r) => ({ id: r.id, phone_number: r.phone_number })),
    });
  } catch (err) {
    logError("Error in GET /api/phone-numbers", { error: err });
    res.status(500).json({ error: "Unable to load phone numbers" });
  }
});

app.post("/api/phone-numbers", requireAuth, requirePaidSubscription, async (req, res) => {
  try {
    const { customerId } = req.auth;
    const result = await provisionNumber({ customerId });
    if (result.success) {
      return res.json({
        phoneNumber: result.phoneNumber,
        phone_number: result.phoneNumber,
      });
    }
    const status = result.error?.includes("No Fonecloud numbers available")
      ? 503
      : 400;
    res.status(status).json({ error: result.error || "Provisioning failed" });
  } catch (err) {
    logError("Error in POST /api/phone-numbers", { error: err });
    res.status(500).json({ error: "Unable to provision phone number" });
  }
});

// Public demo AI endpoint used by marketing phone mockup
app.post("/api/demo/ai-response", async (req, res) => {
  try {
    const leadMessage = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    if (!leadMessage) {
      return res.status(400).json({ error: "message is required" });
    }

    const result = await generateDemoLiveResponse(leadMessage, history);
    return res.json({
      success: !!result.success,
      response: result.response,
      isFallback: !!result.isFallback,
    });
  } catch (err) {
    logError("Error in POST /api/demo/ai-response", { error: err?.message ?? err });
    return res.status(500).json({
      success: false,
      response: "Systemfejl: Kunne ikke forbinde til Replypilot serveren. Prøv igen senere.",
      isFallback: true,
    });
  }
});

app.post("/api/onboarding/analyze-company", async (req, res) => {
  try {
    const companyName = typeof req.body?.companyName === "string" ? req.body.companyName.trim() : "";
    const website = typeof req.body?.website === "string" ? req.body.website.trim() : "";
    if (!companyName) {
      return res.status(400).json({ error: "companyName is required" });
    }

    const result = await analyzeCompanyProfile(companyName, website);
    return res.json(result);
  } catch (err) {
    logError("Error in POST /api/onboarding/analyze-company", { error: err?.message ?? err });
    return res.status(500).json({ error: "Unable to analyze company profile" });
  }
});

app.put("/api/settings", requireAuth, requirePaidSubscription, async (req, res) => {
  try {
    const { customerId } = req.auth;
    const { company = {}, ai = {}, sms = {} } = req.body || {};

    // Basic length guards
    const clamp = (s, max) =>
      typeof s === "string" ? s.slice(0, max) : s ?? null;

    const companyData = {
      company_name: clamp(company.company_name, 200),
      phone_number: clamp(company.phone_number, 50),
      address: clamp(company.address, 300),
      opening_hours: company.opening_hours ?? null,
      forwarding_number: clamp(company.forwarding_number, 50),
      email_forward: clamp(company.email_forward, 200),
      notes: clamp(company.notes, 1000),
    };

    const aiData = {
      agent_name: clamp(ai.agent_name, 100),
      tone: clamp(ai.tone, 50),
      language: clamp(ai.language, 20),
      custom_instructions: clamp(ai.custom_instructions, 5000),
      max_message_length:
        typeof ai.max_message_length === "number"
          ? Math.max(50, Math.min(ai.max_message_length, 500))
          : null,
    };

    const [companySettings, aiSettings] = await Promise.all([
      upsertCompanySettings(customerId, companyData),
      upsertAiSettings(customerId, aiData),
    ]);

    // Optional SMS provider settings
    let smsSettings = null;
    const smsProvider = sms.provider;
    const fonecloudSenderId = sms.fonecloud_sender_id;

    if (smsProvider || fonecloudSenderId) {
      if (smsProvider && !["twilio", "fonecloud"].includes(smsProvider)) {
        return res
          .status(400)
          .json({ error: "Invalid sms provider. Must be 'twilio' or 'fonecloud'." });
      }

      const result = await pool.query(
        `
          UPDATE customers
          SET
            sms_provider = COALESCE($1, sms_provider),
            fonecloud_sender_id = COALESCE($2, fonecloud_sender_id),
            updated_at = NOW()
          WHERE id = $3
          RETURNING sms_provider, fonecloud_sender_id;
        `,
        [smsProvider || null, fonecloudSenderId || null, customerId]
      );

      const row = result.rows[0];
      smsSettings = {
        provider: row.sms_provider,
        fonecloud_sender_id: row.fonecloud_sender_id,
      };
    }

    res.json({
      company: companySettings,
      ai: aiSettings,
      sms: smsSettings,
    });
  } catch (err) {
    logError("Error in PUT /api/settings", { error: err });
    res.status(500).json({ error: "Unable to save settings" });
  }
});

app.put("/api/settings/company", requireAuth, requirePaidSubscription, async (req, res) => {
  try {
    const { customerId } = req.auth;
    const payload = req.body || {};
    const companyData = {
      company_name: payload.companyName ?? payload.company_name ?? null,
      phone_number: payload.phoneNumber ?? payload.phone_number ?? null,
      address: payload.address ?? null,
      opening_hours: payload.openingHours ?? payload.opening_hours ?? null,
      forwarding_number: payload.forwardingNumber ?? payload.forwarding_number ?? null,
      email_forward: payload.emailForward ?? payload.email_forward ?? null,
      notes: payload.notes ?? null,
    };
    const company = await upsertCompanySettings(customerId, companyData);
    res.json(company);
  } catch (err) {
    logError("Error in PUT /api/settings/company", { error: err });
    res.status(500).json({ error: "Unable to save company settings" });
  }
});

app.put("/api/settings/ai", requireAuth, requirePaidSubscription, async (req, res) => {
  try {
    const { customerId } = req.auth;
    const payload = req.body || {};
    const aiData = {
      agent_name: payload.agentName ?? payload.agent_name ?? null,
      tone: payload.responseTone ?? payload.tone ?? null,
      language: payload.language ?? null,
      custom_instructions: payload.systemPrompt ?? payload.custom_instructions ?? null,
      max_message_length: payload.maxTokens ?? payload.max_message_length ?? null,
      fallback_message: payload.fallbackMessage ?? payload.fallback_message ?? null,
      primary_provider: payload.primaryProvider ?? payload.primary_provider ?? 'openai',
      secondary_provider: payload.secondaryProvider ?? payload.secondary_provider ?? null,
    };
    const ai = await upsertAiSettings(customerId, aiData);
    res.json(ai);
  } catch (err) {
    logError("Error in PUT /api/settings/ai", { error: err });
    res.status(500).json({ error: "Unable to save AI settings" });
  }
});

// JSON body only for normal API routes
app.post("/create-checkout-session", requireAuth, async (req, res) => {
  try {
    if (!onboardingFirstFlowEnabled) {
      return res.status(409).json({ error: "Checkout flow currently disabled by feature flag" });
    }
    const { acceptedTerms, acceptedDpa } = req.body || {};

    if (!acceptedTerms || !acceptedDpa) {
      return res.status(400).json({
        error: "Acceptance of terms and data processing agreement (DPA) is required",
      });
    }

    const { customer, subscription } = await getCustomerSubscriptionSnapshot(req.auth.customerId);
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }
    if (subscription) {
      return res.status(409).json({ error: "Subscription already active" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      customer_email: customer.email,
      metadata: {
        customer_name: customer.name || "",
        customer_phone: customer.phone || "",
        accepted_terms: "true",
        accepted_dpa: "true",
        customer_id: String(customer.id),
        user_id: String(req.auth.userId),
      },
      success_url: `${frontendUrl}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}?checkout=cancel`,
    });

    logInfo("checkout_started", {
      customerId: customer.id,
      hasStripeCustomerId: Boolean(customer.stripe_customer_id),
    });

    return res.json({ url: session.url });
  } catch (err) {
    logError("Error creating checkout session", {
      error: err?.message ?? err,
      stack: err?.stack,
    });
    return res.status(500).json({ error: "Unable to create checkout session" });
  }
});

// Simple subscription status endpoint (soft access control)
app.get("/api/subscription-status", express.json(), async (req, res) => {
  const emailQuery = req.query.email;

  try {
    let email =
      typeof emailQuery === "string" && emailQuery.trim() ? emailQuery.trim() : null;
    let customerId = null;

    if (req.auth?.customerId) {
      customerId = req.auth.customerId;
      const snapshot = await getCustomerSubscriptionSnapshot(req.auth.customerId);
      email = snapshot.customer?.email || email;
      const hasActiveSubscription = Boolean(snapshot.subscription);
      return res.json({
        email,
        customerId,
        hasActiveSubscription,
        subscription: snapshot.subscription,
      });
    }

    if (!email) {
      return res.status(400).json({ error: "Missing email" });
    }

    const subscription = await findActiveSubscriptionByEmail(email);
    res.json({
      email,
      hasActiveSubscription: Boolean(subscription),
      subscription,
    });
  } catch (err) {
    logError("Error checking subscription status", { error: err });
    res.status(500).json({ error: "Unable to check subscription status" });
  }
});

// Basic health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Optional SMS health endpoint
app.get("/api/health/sms", async (_req, res) => {
  try {
    const hasTwilioConfig =
      !!process.env.TWILIO_ACCOUNT_SID &&
      !!process.env.TWILIO_AUTH_TOKEN &&
      !!process.env.TWILIO_MESSAGING_SERVICE_SID;

    res.json({
      status: "ok",
      providers: {
        twilio: {
          configured: hasTwilioConfig,
        },
        fonecloud: {
          configured:
            !!process.env.FONECLOUD_API_BASE_URL &&
            !!process.env.FONECLOUD_TOKEN,
        },
      },
    });
  } catch (err) {
    logError("SMS health check failed", { error: err?.message });
    res.status(500).json({ status: "error" });
  }
});

// Static frontend (when frontend_dist is mounted at frontend-dist)
const frontendDist = path.join(__dirname, "frontend-dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

const isDirectRun =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  initDb()
    .then(() => initAuthDb())
    .then(() => {
      app.listen(port, () => {
        logInfo(`Stripe server running on port ${port}`);
      });
    })
    .catch((err) => {
      logError("Failed to initialize database", { error: err });
      process.exit(1);
    });
}

export default app;

