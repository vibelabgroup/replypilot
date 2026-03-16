-- Migration: 013_email_channel_and_drafts.sql
-- Extend conversations/messages for email channel, add email_drafts table,
-- add sync cursors for email accounts and store connections.

-- 1. Allow email-only conversations (lead_phone was NOT NULL)
ALTER TABLE conversations
    ALTER COLUMN lead_phone DROP NOT NULL;

-- 2. Link conversations to the email account that received the inbound email
ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS email_account_id UUID REFERENCES email_accounts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS email_thread_id TEXT,
    ADD COLUMN IF NOT EXISTS email_subject TEXT;

CREATE INDEX IF NOT EXISTS idx_conversations_email_account
    ON conversations(email_account_id) WHERE email_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_email_thread
    ON conversations(email_account_id, email_thread_id) WHERE email_thread_id IS NOT NULL;

-- 3. Link messages to the underlying email_message row (for traceability)
ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS email_message_id UUID REFERENCES email_messages(id) ON DELETE SET NULL;

-- 4. Add direction column to email_messages (was implicitly inbound-only)
ALTER TABLE email_messages
    ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'inbound';

-- 5. Email drafts table: AI-generated draft replies awaiting human review/send
CREATE TABLE IF NOT EXISTS email_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    email_account_id UUID NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    email_message_id UUID REFERENCES email_messages(id) ON DELETE SET NULL,
    in_reply_to_provider_id TEXT,
    thread_id TEXT,
    to_addresses TEXT[] NOT NULL,
    cc_addresses TEXT[] DEFAULT '{}'::TEXT[],
    subject TEXT,
    body_plain TEXT,
    body_html TEXT,
    status TEXT NOT NULL DEFAULT 'draft', -- 'draft' | 'approved' | 'sent' | 'discarded'
    sent_provider_message_id TEXT,
    sent_at TIMESTAMPTZ,
    ai_model TEXT,
    ai_tokens_used INTEGER,
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    meta JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_drafts_customer
    ON email_drafts(customer_id, status);

CREATE INDEX IF NOT EXISTS idx_email_drafts_conversation
    ON email_drafts(conversation_id) WHERE conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_drafts_account
    ON email_drafts(email_account_id, status);

-- 6. Sync cursors for email accounts (track Gmail historyId / Outlook deltaLink)
ALTER TABLE email_accounts
    ADD COLUMN IF NOT EXISTS sync_cursor TEXT,
    ADD COLUMN IF NOT EXISTS sync_error TEXT,
    ADD COLUMN IF NOT EXISTS sync_error_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS next_sync_at TIMESTAMPTZ;

-- 7. Store connection sync scheduling fields
ALTER TABLE store_connections
    ADD COLUMN IF NOT EXISTS sync_interval_minutes INTEGER NOT NULL DEFAULT 60,
    ADD COLUMN IF NOT EXISTS next_sync_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS sync_error TEXT,
    ADD COLUMN IF NOT EXISTS sync_error_count INTEGER NOT NULL DEFAULT 0;

-- 8. Unique constraint on email_messages to prevent double-import
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_messages_provider_unique
    ON email_messages(email_account_id, provider_message_id);

-- 9. Triggers for new tables
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_email_drafts_updated_at'
    ) THEN
        CREATE TRIGGER update_email_drafts_updated_at
        BEFORE UPDATE ON email_drafts
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    END IF;
END
$$;
