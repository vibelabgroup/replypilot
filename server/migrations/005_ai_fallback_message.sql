-- 005_ai_fallback_message.sql
-- Ensure ai_settings has a fallback_message column for older databases

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

