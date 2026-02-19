-- 006_ai_providers.sql
-- Add primary/secondary AI provider columns to ai_settings for multi-provider support

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
END
$$;

