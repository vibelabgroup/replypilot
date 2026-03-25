-- Migration: 015_email_error_logging.sql
-- Add email error logging for monitoring and debugging

CREATE TABLE IF NOT EXISTS email_error_log (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
    email_account_id INTEGER REFERENCES email_accounts(id) ON DELETE CASCADE,
    store_connection_id INTEGER REFERENCES store_connections(id) ON DELETE SET NULL,
    to_address TEXT NOT NULL,
    subject TEXT,
    error_type TEXT NOT NULL,
    error_message TEXT NOT NULL,
    attempt INTEGER NOT NULL DEFAULT 1,
    context JSONB NOT NULL DEFAULT '{}'::JSONB,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_email_error_log_customer 
    ON email_error_log(customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_error_log_account 
    ON email_error_log(email_account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_error_log_type 
    ON email_error_log(error_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_error_log_unresolved 
    ON email_error_log(resolved, created_at DESC) WHERE resolved = FALSE;

-- Trigger to keep updated_at current (if we add one later)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_email_error_log_updated_at'
    ) THEN
        CREATE TRIGGER update_email_error_log_updated_at
        BEFORE UPDATE ON email_error_log
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    END IF;
END
$$;
