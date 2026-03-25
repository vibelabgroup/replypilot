-- Migration: 014_email_send_as_aliases.sql
-- Add send-as alias support for email accounts

-- Table to store discovered send-as aliases for each email account
CREATE TABLE IF NOT EXISTS email_send_as_aliases (
    id SERIAL PRIMARY KEY,
    email_account_id INTEGER NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
    send_as_email TEXT NOT NULL,
    display_name TEXT,
    reply_to_address TEXT,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    treat_as_alias BOOLEAN NOT NULL DEFAULT FALSE,
    verification_status TEXT NOT NULL DEFAULT 'pending', -- 'accepted' | 'pending' | 'error'
    smtp_msa JSONB, -- SMTP relay configuration if used
    last_verified_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (email_account_id, send_as_email)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_email_send_as_aliases_account 
    ON email_send_as_aliases(email_account_id);

CREATE INDEX IF NOT EXISTS idx_email_send_as_aliases_email 
    ON email_send_as_aliases(LOWER(send_as_email));

CREATE INDEX IF NOT EXISTS idx_email_send_as_aliases_active 
    ON email_send_as_aliases(email_account_id, is_active, verification_status);

-- Add alias-related columns to email_accounts table
ALTER TABLE email_accounts 
    ADD COLUMN IF NOT EXISTS send_as_discovered_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS send_as_sync_error TEXT,
    ADD COLUMN IF NOT EXISTS default_send_as_email TEXT; -- References email_send_as_aliases.send_as_email

-- Add email routing columns to store_connections
ALTER TABLE store_connections 
    ADD COLUMN IF NOT EXISTS default_from_email TEXT,
    ADD COLUMN IF NOT EXISTS reply_to_email TEXT,
    ADD COLUMN IF NOT EXISTS email_signature TEXT;

-- Add email routing columns to email_messages for outbound tracking
ALTER TABLE email_messages 
    ADD COLUMN IF NOT EXISTS actual_from_address TEXT, -- The actual From: header used
    ADD COLUMN IF NOT EXISTS send_as_alias_id INTEGER REFERENCES email_send_as_aliases(id) ON DELETE SET NULL;

-- Trigger to keep updated_at current
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_email_send_as_aliases_updated_at'
    ) THEN
        CREATE TRIGGER update_email_send_as_aliases_updated_at
        BEFORE UPDATE ON email_send_as_aliases
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    END IF;
END
$$;
