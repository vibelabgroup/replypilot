-- 007_default_ai_models.sql
-- Add per-client AI model overrides and system default AI models for new clients

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_settings' AND column_name = 'gemini_model'
    ) THEN
        ALTER TABLE ai_settings ADD COLUMN gemini_model VARCHAR(120);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_settings' AND column_name = 'groq_model'
    ) THEN
        ALTER TABLE ai_settings ADD COLUMN groq_model VARCHAR(120);
    END IF;
END
$$;

-- System defaults for new clients (used when ai_settings.gemini_model / groq_model is NULL)
INSERT INTO system_settings (key, value)
VALUES
  ('default_gemini_model', 'gemini-2.5-flash'),
  ('default_groq_model', 'llama-3.1-8b-instant')
ON CONFLICT (key) DO NOTHING;
