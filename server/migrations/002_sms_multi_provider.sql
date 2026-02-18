-- 002_sms_multi_provider.sql
-- Add multi-provider SMS support columns

DO $$
BEGIN
    -- customers.sms_provider
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'customers'
          AND column_name = 'sms_provider'
    ) THEN
        ALTER TABLE customers
        ADD COLUMN sms_provider VARCHAR(50);

        UPDATE customers
        SET sms_provider = 'twilio'
        WHERE sms_provider IS NULL;

        ALTER TABLE customers
        ALTER COLUMN sms_provider SET NOT NULL;

        ALTER TABLE customers
        ADD CONSTRAINT sms_provider_enum
        CHECK (sms_provider IN ('twilio', 'fonecloud'));
    END IF;

    -- customers.fonecloud_sender_id (optional, nullable)
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'customers'
          AND column_name = 'fonecloud_sender_id'
    ) THEN
        ALTER TABLE customers
        ADD COLUMN fonecloud_sender_id VARCHAR(50);
    END IF;

    -- messages.provider_message_id
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'messages'
          AND column_name = 'provider_message_id'
    ) THEN
        ALTER TABLE messages
        ADD COLUMN provider_message_id VARCHAR(255);
    END IF;

    -- messages.sms_provider
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'messages'
          AND column_name = 'sms_provider'
    ) THEN
        ALTER TABLE messages
        ADD COLUMN sms_provider VARCHAR(50);
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_customers_sms_provider
    ON customers(sms_provider);

