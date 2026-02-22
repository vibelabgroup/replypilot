-- 009_openai_default.sql
-- Add OpenAI as supported provider: openai_model column and default_openai_model system setting

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_settings' AND column_name = 'openai_model'
    ) THEN
        ALTER TABLE ai_settings ADD COLUMN openai_model VARCHAR(120);
    END IF;
END
$$;

-- System default model for OpenAI (used when ai_settings.openai_model is NULL)
INSERT INTO system_settings (key, value)
VALUES ('default_openai_model', 'gpt-4o-mini')
ON CONFLICT (key) DO NOTHING;
