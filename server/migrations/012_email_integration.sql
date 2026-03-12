-- Migration: 012_email_integration.sql
-- Email OAuth accounts and normalized email messages

-- Email accounts per customer (OAuth-based mailboxes)
CREATE TABLE IF NOT EXISTS email_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    provider TEXT NOT NULL, -- 'gmail' | 'outlook'
    email_address TEXT NOT NULL,
    display_name TEXT,
    provider_user_id TEXT,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TIMESTAMPTZ,
    scopes TEXT[] DEFAULT '{}'::TEXT[],
    status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'disabled' | 'error'
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_accounts_customer
    ON email_accounts(customer_id);

CREATE INDEX IF NOT EXISTS idx_email_accounts_email
    ON email_accounts(LOWER(email_address));

-- Normalized inbound email messages
CREATE TABLE IF NOT EXISTS email_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    email_account_id UUID NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
    provider_message_id TEXT NOT NULL,
    thread_id TEXT,
    from_address TEXT NOT NULL,
    to_addresses TEXT[] NOT NULL,
    cc_addresses TEXT[] DEFAULT '{}'::TEXT[],
    subject TEXT,
    snippet TEXT,
    body_plain TEXT,
    body_html TEXT,
    received_at TIMESTAMPTZ NOT NULL,
    store_connection_id UUID REFERENCES store_connections(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    meta JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_messages_customer
    ON email_messages(customer_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_messages_thread
    ON email_messages(email_account_id, thread_id);

CREATE INDEX IF NOT EXISTS idx_email_messages_store
    ON email_messages(store_connection_id, received_at DESC);

-- Triggers to keep updated_at current on new tables, reusing existing function
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_email_accounts_updated_at'
    ) THEN
        CREATE TRIGGER update_email_accounts_updated_at
        BEFORE UPDATE ON email_accounts
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_email_messages_updated_at'
    ) THEN
        CREATE TRIGGER update_email_messages_updated_at
        BEFORE UPDATE ON email_messages
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    END IF;
END
$$;

