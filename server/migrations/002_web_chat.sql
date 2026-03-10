-- Migration: 002_web_chat.sql
-- Add support for web chat channel and widget/session tables

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'channel_type') THEN
        CREATE TYPE channel_type AS ENUM ('sms', 'web_chat', 'voice_demo');
    END IF;
END
$$;

-- Add channel column to conversations (default to NULL for backwards compatibility)
ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS channel channel_type;

-- Backfill existing rows to sms where channel is NULL
UPDATE conversations
SET channel = 'sms'
WHERE channel IS NULL;

-- Add channel column to messages (optional, for analytics and future routing)
ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS channel channel_type;

-- Backfill existing messages based on their conversation's channel
UPDATE messages m
SET channel = c.channel
FROM conversations c
WHERE m.conversation_id = c.id
  AND m.channel IS NULL;

-- Chat widgets (per customer configuration for embeddable web chat)
CREATE TABLE IF NOT EXISTS chat_widgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    public_key VARCHAR(128) NOT NULL UNIQUE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    allowed_origins TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    theme JSONB NOT NULL DEFAULT '{}'::JSONB,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_widgets_customer_id
    ON chat_widgets(customer_id);

-- Web chat sessions (per visitor conversation instance)
CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_widget_id UUID NOT NULL REFERENCES chat_widgets(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    visitor_id VARCHAR(255),
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    last_seen_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_customer
    ON chat_sessions(customer_id, status);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_conversation
    ON chat_sessions(conversation_id);

-- Ensure updated_at is maintained for new tables using existing trigger function
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'update_chat_widgets_updated_at'
    ) THEN
        CREATE TRIGGER update_chat_widgets_updated_at
        BEFORE UPDATE ON chat_widgets
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'update_chat_sessions_updated_at'
    ) THEN
        CREATE TRIGGER update_chat_sessions_updated_at
        BEFORE UPDATE ON chat_sessions
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    END IF;
END
$$;

