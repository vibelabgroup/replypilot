import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("Missing DATABASE_URL environment variable for Postgres.");
  process.exit(1);
}

export const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
});

export async function initDb() {
  // Basic schema creation – safe to run multiple times
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      phone TEXT,
      stripe_customer_id TEXT UNIQUE,
      stripe_subscription_id TEXT UNIQUE,
      status TEXT NOT NULL DEFAULT 'trial',
      subscription_status TEXT NOT NULL DEFAULT 'trialing',
      current_period_start TIMESTAMPTZ,
      current_period_end TIMESTAMPTZ,
      cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
      trial_end TIMESTAMPTZ,
      sms_provider VARCHAR(50) NOT NULL DEFAULT 'twilio',
      fonecloud_sender_id VARCHAR(50),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'customer',
      email_verified BOOLEAN NOT NULL DEFAULT FALSE,
      last_login_at TIMESTAMPTZ,
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TIMESTAMPTZ,
      password_reset_token TEXT,
      password_reset_expires TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      stripe_subscription_id TEXT UNIQUE NOT NULL,
      stripe_price_id TEXT NOT NULL,
      status TEXT NOT NULL,
      current_period_start TIMESTAMPTZ,
      current_period_end TIMESTAMPTZ,
      cancel_at TIMESTAMPTZ,
      canceled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS stripe_events (
      id SERIAL PRIMARY KEY,
      stripe_event_id TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      payload JSONB
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS company_settings (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER UNIQUE NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      company_name TEXT,
      website TEXT,
      industry TEXT,
      phone_number TEXT,
      address TEXT,
      city TEXT,
      postal_code TEXT,
      country TEXT,
      contact_name TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      opening_hours JSONB,
      forwarding_number TEXT,
      email_forward TEXT,
      notes TEXT,
      vat_number TEXT,
      service_area TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_settings (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER UNIQUE NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      agent_name TEXT,
      tone TEXT,
      language TEXT,
      custom_instructions TEXT,
      max_message_length INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS routing_rules (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      rules JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sms_templates (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS twilio_numbers (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      phone_number TEXT NOT NULL,
      twilio_sid TEXT,
      twilio_friendly_name TEXT,
      monthly_cost NUMERIC(10,2) DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS fonecloud_numbers (
      id SERIAL PRIMARY KEY,
      phone_number TEXT NOT NULL UNIQUE,
      customer_id INTEGER NULL REFERENCES customers(id) ON DELETE SET NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      allocated_at TIMESTAMPTZ,
      released_at TIMESTAMPTZ,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'customers' AND column_name = 'fonecloud_number_id') THEN
        ALTER TABLE customers ADD COLUMN fonecloud_number_id INTEGER REFERENCES fonecloud_numbers(id) ON DELETE SET NULL;
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'conversations' AND column_name = 'fonecloud_number_id') THEN
        ALTER TABLE conversations ADD COLUMN fonecloud_number_id INTEGER REFERENCES fonecloud_numbers(id) ON DELETE SET NULL;
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      twilio_number_id INTEGER REFERENCES twilio_numbers(id) ON DELETE SET NULL,
      fonecloud_number_id INTEGER REFERENCES fonecloud_numbers(id) ON DELETE SET NULL,
      lead_name TEXT,
      lead_phone TEXT NOT NULL,
      lead_email TEXT,
      lead_source TEXT DEFAULT 'sms',
      status TEXT NOT NULL DEFAULT 'active',
      last_message_at TIMESTAMPTZ,
      message_count INTEGER NOT NULL DEFAULT 0,
      ai_response_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      direction TEXT NOT NULL,
      sender TEXT NOT NULL,
      content TEXT NOT NULL,
      twilio_message_sid TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      conversation_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
      name TEXT,
      phone TEXT,
      email TEXT,
      source TEXT DEFAULT 'sms',
      qualification TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_preferences (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      email_enabled BOOLEAN DEFAULT TRUE,
      email_new_lead BOOLEAN DEFAULT TRUE,
      email_new_message BOOLEAN DEFAULT FALSE,
      email_daily_digest BOOLEAN DEFAULT TRUE,
      email_weekly_report BOOLEAN DEFAULT TRUE,
      sms_enabled BOOLEAN DEFAULT FALSE,
      sms_phone TEXT,
      sms_new_lead BOOLEAN DEFAULT TRUE,
      sms_new_message BOOLEAN DEFAULT FALSE,
      digest_type TEXT DEFAULT 'daily',
      digest_time TIME DEFAULT '09:00',
      cadence_mode VARCHAR(20) NOT NULL DEFAULT 'immediate',
      cadence_interval_minutes INTEGER,
      max_notifications_per_day INTEGER,
      quiet_hours_start TIME,
      quiet_hours_end TIME,
      timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Copenhagen',
      notify_lead_managed BOOLEAN NOT NULL DEFAULT TRUE,
      notify_lead_converted BOOLEAN NOT NULL DEFAULT TRUE,
      notify_ai_failed BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(customer_id, user_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_queue (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL,
      channel VARCHAR(20) NOT NULL,
      status VARCHAR(20) DEFAULT 'pending',
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      error_message TEXT,
      scheduled_for TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 3,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_notification_queue_status
      ON notification_queue(status, scheduled_for);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_digest_buckets (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      channel VARCHAR(20) NOT NULL,
      event_types JSONB NOT NULL DEFAULT '[]',
      events JSONB NOT NULL DEFAULT '[]',
      event_count INTEGER NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      window_start TIMESTAMPTZ NOT NULL,
      window_end TIMESTAMPTZ NOT NULL,
      scheduled_for TIMESTAMPTZ NOT NULL,
      sent_at TIMESTAMPTZ,
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 3,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_notification_digest_buckets_due
      ON notification_digest_buckets(status, scheduled_for);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_notification_digest_buckets_customer
      ON notification_digest_buckets(customer_id, status, window_end DESC);
  `);

  // Ensure SMS multi-provider columns exist on existing databases as well.
  // This mirrors the logic in migrations/002_sms_multi_provider.sql but runs
  // automatically at startup so the code works without manual migration steps.
  await pool.query(`
    DO $$
    BEGIN
      -- customers.sms_provider
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'customers'
          AND column_name = 'sms_provider'
      ) THEN
        ALTER TABLE customers
        ADD COLUMN sms_provider VARCHAR(50);

        UPDATE customers
        SET sms_provider = 'twilio'
        WHERE sms_provider IS NULL;

        ALTER TABLE customers
        ALTER COLUMN sms_provider SET NOT NULL;

        ALTER TABLE customers
        ADD CONSTRAINT sms_provider_enum
        CHECK (sms_provider IN ('twilio', 'fonecloud'));
      END IF;

      -- customers.fonecloud_sender_id (optional, nullable)
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'customers'
          AND column_name = 'fonecloud_sender_id'
      ) THEN
        ALTER TABLE customers
        ADD COLUMN fonecloud_sender_id VARCHAR(50);
      END IF;
    END
    $$;
  `);

  await pool.query(`
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(20) DEFAULT 'pending';
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivery_error TEXT;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS twilio_status VARCHAR(50);
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;
  `);

  await pool.query(`
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes TEXT;
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS estimated_value NUMERIC(12,2);
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS converted_value NUMERIC(12,2);
  `);

  await pool.query(`
    ALTER TABLE notification_preferences
      ADD COLUMN IF NOT EXISTS cadence_mode VARCHAR(20) NOT NULL DEFAULT 'immediate',
      ADD COLUMN IF NOT EXISTS cadence_interval_minutes INTEGER,
      ADD COLUMN IF NOT EXISTS max_notifications_per_day INTEGER,
      ADD COLUMN IF NOT EXISTS quiet_hours_start TIME,
      ADD COLUMN IF NOT EXISTS quiet_hours_end TIME,
      ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Copenhagen',
      ADD COLUMN IF NOT EXISTS notify_lead_managed BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS notify_lead_converted BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS notify_ai_failed BOOLEAN NOT NULL DEFAULT TRUE;
  `);

  // Ensure messages has provider_message_id and sms_provider columns for multi-provider support.
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'messages'
          AND column_name = 'provider_message_id'
      ) THEN
        ALTER TABLE messages
        ADD COLUMN provider_message_id VARCHAR(255);
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'messages'
          AND column_name = 'sms_provider'
      ) THEN
        ALTER TABLE messages
        ADD COLUMN sms_provider VARCHAR(50);
      END IF;
    END
    $$;
  `);

  // Ensure company_settings has website, industry, VAT/CVR, service area and extended address/contact fields.
  await pool.query(`
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS website TEXT;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS industry TEXT;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS vat_number TEXT;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS service_area TEXT;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS city TEXT;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS postal_code TEXT;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS country TEXT;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS contact_name TEXT;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS contact_email TEXT;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS contact_phone TEXT;
  `);

  // Ensure ai_settings.agent_name exists on existing databases.
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'ai_settings'
          AND column_name = 'agent_name'
      ) THEN
        ALTER TABLE ai_settings
        ADD COLUMN agent_name TEXT;
      END IF;
    END
    $$;
  `);

  // Ensure ai_settings.fallback_message exists on existing databases.
  // Mirrors migrations/005_ai_fallback_message.sql.
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'ai_settings'
          AND column_name = 'fallback_message'
      ) THEN
        ALTER TABLE ai_settings
        ADD COLUMN fallback_message TEXT;
      END IF;
    END
    $$;
  `);

  // Ensure ai_settings has primary/secondary provider columns on existing databases.
  // Mirrors migrations/006_ai_providers.sql so deployments work without manual migration runs.
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'ai_settings'
          AND column_name = 'primary_provider'
      ) THEN
        ALTER TABLE ai_settings
        ADD COLUMN primary_provider VARCHAR(20) NOT NULL DEFAULT 'gemini';
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'ai_settings'
          AND column_name = 'secondary_provider'
      ) THEN
        ALTER TABLE ai_settings
        ADD COLUMN secondary_provider VARCHAR(20);
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'ai_settings'
          AND column_name = 'gemini_model'
      ) THEN
        ALTER TABLE ai_settings ADD COLUMN gemini_model VARCHAR(120);
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'ai_settings'
          AND column_name = 'groq_model'
      ) THEN
        ALTER TABLE ai_settings ADD COLUMN groq_model VARCHAR(120);
      END IF;
    END
    $$;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_customers_sms_provider
      ON customers(sms_provider);
  `);

  // Ensure customers table has status/subscription columns (used by auth and admin).
  const customerColumns = [
    ['status', 'TEXT NOT NULL DEFAULT \'trial\''],
    ['subscription_status', 'TEXT NOT NULL DEFAULT \'trialing\''],
    ['current_period_start', 'TIMESTAMPTZ'],
    ['current_period_end', 'TIMESTAMPTZ'],
    ['stripe_subscription_id', 'TEXT UNIQUE'],
    ['cancel_at_period_end', 'BOOLEAN NOT NULL DEFAULT FALSE'],
    ['trial_end', 'TIMESTAMPTZ'],
  ];
  for (const [col, def] of customerColumns) {
    await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS ${col} ${def}`);
  }
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status)`);

  // Sessions table (used by auth middleware: token_hash, revoked, etc.)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      ip_address INET,
      user_agent TEXT,
      revoked BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  const sessionColumns = [
    ['token_hash', 'TEXT UNIQUE'],
    ['ip_address', 'INET'],
    ['user_agent', 'TEXT'],
    ['revoked', 'BOOLEAN NOT NULL DEFAULT FALSE'],
  ];
  for (const [col, def] of sessionColumns) {
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ${col} ${def}`);
  }
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash) WHERE token_hash IS NOT NULL`);

  // If sessions was created by auth.mjs with token NOT NULL, allow NULL so admin (token_hash-only) inserts work
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'token'
      ) THEN
        ALTER TABLE sessions ALTER COLUMN token DROP NOT NULL;
      END IF;
    END $$;
  `);

  // Ensure users table has all columns required by auth (role, lockout, reset, etc.).
  // Runs automatically at startup so no separate migration step is required.
  const userColumns = [
    ['role', 'TEXT NOT NULL DEFAULT \'customer\''],
    ['email_verified', 'BOOLEAN NOT NULL DEFAULT FALSE'],
    ['last_login_at', 'TIMESTAMPTZ'],
    ['failed_login_attempts', 'INTEGER NOT NULL DEFAULT 0'],
    ['locked_until', 'TIMESTAMPTZ'],
    ['password_reset_token', 'TEXT'],
    ['password_reset_expires', 'TIMESTAMPTZ'],
  ];
  for (const [col, def] of userColumns) {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${col} ${def}`);
  }
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role) WHERE role = 'admin';
  `);

  await pool.query(`
    INSERT INTO customers (email, name)
    VALUES ('admin@replypilot.dk', 'Replypilot Admin')
    ON CONFLICT (email) DO NOTHING;
  `);
  await pool.query(`
    INSERT INTO users (customer_id, email, password_hash, role)
    SELECT c.id, 'nh@vibelab.cloud', '$2a$10$XV6.DkKQldrFugUXPFLyKuUsinXr.lgfkyaXgQLyTeBx5QFDpkG3.', 'admin'
    FROM customers c
    WHERE c.email = 'admin@replypilot.dk'
    ON CONFLICT (email) DO NOTHING;
  `);
}

export async function upsertCompanySettings(customerId, data) {
  const result = await pool.query(
    `
      INSERT INTO company_settings (
        customer_id,
        company_name,
        phone_number,
        address,
        opening_hours,
        forwarding_number,
        email_forward,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (customer_id) DO UPDATE
      SET
        company_name = EXCLUDED.company_name,
        phone_number = EXCLUDED.phone_number,
        address = EXCLUDED.address,
        opening_hours = EXCLUDED.opening_hours,
        forwarding_number = EXCLUDED.forwarding_number,
        email_forward = EXCLUDED.email_forward,
        notes = EXCLUDED.notes,
        updated_at = NOW()
      RETURNING *;
    `,
    [
      customerId,
      data.company_name || null,
      data.phone_number || null,
      data.address || null,
      data.opening_hours || null,
      data.forwarding_number || null,
      data.email_forward || null,
      data.notes || null,
    ]
  );

  return result.rows[0];
}

export async function upsertAiSettings(customerId, data) {
  const result = await pool.query(
    `
      INSERT INTO ai_settings (
        customer_id,
        agent_name,
        tone,
        language,
        custom_instructions,
        max_message_length,
        fallback_message,
        primary_provider,
        secondary_provider
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (customer_id) DO UPDATE
      SET
        agent_name = EXCLUDED.agent_name,
        tone = EXCLUDED.tone,
        language = EXCLUDED.language,
        custom_instructions = EXCLUDED.custom_instructions,
        max_message_length = EXCLUDED.max_message_length,
        fallback_message = EXCLUDED.fallback_message,
        primary_provider = EXCLUDED.primary_provider,
        secondary_provider = EXCLUDED.secondary_provider,
        updated_at = NOW()
      RETURNING *;
    `,
    [
      customerId,
      data.agent_name || null,
      data.tone || null,
      data.language || null,
      data.custom_instructions || null,
      data.max_message_length || null,
      data.fallback_message || null,
      data.primary_provider || 'gemini',
      data.secondary_provider || null,
    ]
  );

  return result.rows[0];
}

export async function getSettingsByCustomerId(customerId) {
  const [companyRes, aiRes, customerRes, metricsRes] = await Promise.all([
    pool.query(
      "SELECT * FROM company_settings WHERE customer_id = $1 LIMIT 1",
      [customerId]
    ),
    pool.query("SELECT * FROM ai_settings WHERE customer_id = $1 LIMIT 1", [
      customerId,
    ]),
    pool.query(
      `SELECT c.sms_provider, c.fonecloud_sender_id, c.fonecloud_number_id, fn.phone_number AS fonecloud_phone_number
       FROM customers c
       LEFT JOIN fonecloud_numbers fn ON c.fonecloud_number_id = fn.id AND fn.is_active = true
       WHERE c.id = $1 LIMIT 1`,
      [customerId]
    ),
    pool.query(
      `SELECT value
       FROM system_settings
       WHERE key = 'dashboard_minutes_saved_per_message'
       LIMIT 1`,
      []
    ),
  ]);

  const customerRow = customerRes.rows[0] || null;
  const rawMinutesPerMessage = Number.parseInt(metricsRes.rows[0]?.value || "2", 10);
  const minutesSavedPerMessage = Number.isFinite(rawMinutesPerMessage)
    ? Math.max(1, Math.min(rawMinutesPerMessage, 60))
    : 2;

  return {
    company: companyRes.rows[0] || null,
    ai: aiRes.rows[0] || null,
    metrics: {
      minutes_saved_per_message: minutesSavedPerMessage,
    },
    sms: customerRow
      ? {
          provider: customerRow.sms_provider || 'twilio',
          fonecloud_sender_id: customerRow.fonecloud_sender_id || null,
          fonecloud_number_id: customerRow.fonecloud_number_id || null,
          fonecloud_phone_number: customerRow.fonecloud_phone_number || null,
        }
      : null,
  };
}

export async function recordStripeEventIfNew(eventId, type, payload) {
  const result = await pool.query(
    `
      INSERT INTO stripe_events (stripe_event_id, type, payload)
      VALUES ($1, $2, $3)
      ON CONFLICT (stripe_event_id) DO NOTHING
      RETURNING id;
    `,
    [eventId, type, payload]
  );

  return result.rowCount > 0;
}

export async function upsertCustomer({ email, name, phone, stripeCustomerId }) {
  if (!email) {
    throw new Error("upsertCustomer requires an email");
  }

  const result = await pool.query(
    `
      INSERT INTO customers (email, name, phone, stripe_customer_id)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (email) DO UPDATE
      SET
        name = COALESCE(EXCLUDED.name, customers.name),
        phone = COALESCE(EXCLUDED.phone, customers.phone),
        stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, customers.stripe_customer_id),
        updated_at = NOW()
      RETURNING *;
    `,
    [email, name || null, phone || null, stripeCustomerId || null]
  );

  return result.rows[0];
}

export async function upsertSubscriptionFromStripeObject(customerId, stripeSub) {
  const stripeSubscriptionId = stripeSub.id;
  const price = stripeSub.items?.data?.[0]?.price;

  const priceId = price?.id;
  const status = stripeSub.status;

  const currentPeriodStart = stripeSub.current_period_start
    ? new Date(stripeSub.current_period_start * 1000)
    : null;
  const currentPeriodEnd = stripeSub.current_period_end
    ? new Date(stripeSub.current_period_end * 1000)
    : null;

  const cancelAt = stripeSub.cancel_at
    ? new Date(stripeSub.cancel_at * 1000)
    : null;
  const canceledAt = stripeSub.canceled_at
    ? new Date(stripeSub.canceled_at * 1000)
    : null;

  const result = await pool.query(
    `
      INSERT INTO subscriptions (
        customer_id,
        stripe_subscription_id,
        stripe_price_id,
        status,
        current_period_start,
        current_period_end,
        cancel_at,
        canceled_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (stripe_subscription_id) DO UPDATE
      SET
        customer_id = EXCLUDED.customer_id,
        stripe_price_id = EXCLUDED.stripe_price_id,
        status = EXCLUDED.status,
        current_period_start = EXCLUDED.current_period_start,
        current_period_end = EXCLUDED.current_period_end,
        cancel_at = EXCLUDED.cancel_at,
        canceled_at = EXCLUDED.canceled_at,
        updated_at = NOW()
      RETURNING *;
    `,
    [
      customerId,
      stripeSubscriptionId,
      priceId || null,
      status,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAt,
      canceledAt,
    ]
  );

  return result.rows[0];
}

export async function findActiveSubscriptionByEmail(email) {
  const result = await pool.query(
    `
      SELECT s.*
      FROM subscriptions s
      JOIN customers c ON s.customer_id = c.id
      WHERE c.email = $1
        AND s.status IN ('active', 'trialing', 'past_due')
      ORDER BY s.current_period_end DESC
      LIMIT 1;
    `,
    [email]
  );

  return result.rows[0] || null;
}

