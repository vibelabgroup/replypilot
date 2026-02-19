-- Fonecloud number pool and customer/conversation links (Option B)
-- Run after 001_initial.sql and 002_sms_multi_provider.sql

-- Pool table: pre-purchased numbers; customer_id NULL = available
CREATE TABLE IF NOT EXISTS fonecloud_numbers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number VARCHAR(50) NOT NULL UNIQUE,
    customer_id UUID NULL REFERENCES customers(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE,
    allocated_at TIMESTAMP WITH TIME ZONE,
    released_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fonecloud_numbers_customer_id ON fonecloud_numbers(customer_id);
CREATE INDEX IF NOT EXISTS idx_fonecloud_numbers_phone ON fonecloud_numbers(phone_number);
CREATE INDEX IF NOT EXISTS idx_fonecloud_numbers_pool ON fonecloud_numbers(customer_id, is_active)
    WHERE customer_id IS NULL AND is_active = TRUE;

-- Link customer to allocated Fonecloud number
ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS fonecloud_number_id UUID NULL REFERENCES fonecloud_numbers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customers_fonecloud_number_id ON customers(fonecloud_number_id)
    WHERE fonecloud_number_id IS NOT NULL;

-- Link conversation to Fonecloud number when used for that conversation
ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS fonecloud_number_id UUID NULL REFERENCES fonecloud_numbers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_fonecloud_number_id ON conversations(fonecloud_number_id)
    WHERE fonecloud_number_id IS NOT NULL;
