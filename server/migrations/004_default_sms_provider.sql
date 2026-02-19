-- 004_default_sms_provider.sql
-- Create system_settings store and initialize default SMS provider

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_name = 'system_settings'
    ) THEN
        CREATE TABLE system_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    END IF;
END
$$;

-- Ensure a default value exists for the global SMS provider
INSERT INTO system_settings (key, value)
VALUES ('default_sms_provider', 'twilio')
ON CONFLICT (key) DO NOTHING;

