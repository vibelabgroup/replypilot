import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import cors from "cors";
import Stripe from "stripe";
import cookieParser from "cookie-parser";
import { logInfo, logWarn, logError } from "./logger.mjs";
import { handleIncomingMessage } from "./sms/gateway.mjs";
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

        const customer = await upsertCustomer({
          email,
          name,
          phone,
          stripeCustomerId,
        });

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

        logInfo("Handled checkout.session.completed", { email });
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

app.get("/api/me", requireAuth, async (req, res) => {
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

    const customerResult = await pool.query(
      `
        SELECT id, email, name, phone
        FROM customers
        WHERE id = $1
        LIMIT 1;
      `,
      [customerId]
    );

    const customer = customerResult.rows[0] || null;

    const subscription = customer
      ? await findActiveSubscriptionByEmail(customer.email)
      : null;

    res.json({
      user,
      customer,
      subscription,
    });
  } catch (err) {
    logError("Error in /api/me", { error: err });
    res.status(500).json({ error: "Unable to load profile" });
  }
});

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

app.put("/api/settings", requireAuth, async (req, res) => {
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

// JSON body only for normal API routes
app.post("/create-checkout-session", async (req, res) => {
  try {
    const { name, email, phone, acceptedTerms, acceptedDpa } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    if (!acceptedTerms || !acceptedDpa) {
      return res.status(400).json({
        error: "Acceptance of terms and data processing agreement (DPA) is required",
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      customer_email: email,
      metadata: {
        customer_name: name || "",
        customer_phone: phone || "",
        accepted_terms: "true",
        accepted_dpa: "true",
      },
      success_url: `${frontendUrl}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}?checkout=cancel`,
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
  const email = req.query.email;

  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "Missing email" });
  }

  try {
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

