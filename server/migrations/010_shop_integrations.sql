-- Migration: 010_shop_integrations.sql
-- WooCommerce & Shopify integration schema

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'store_platform') THEN
        CREATE TYPE store_platform AS ENUM ('woo', 'shopify');
    END IF;
END
$$;

-- Per-customer store connection configuration
CREATE TABLE IF NOT EXISTS store_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    platform store_platform NOT NULL,
    store_name TEXT,
    store_domain TEXT NOT NULL,
    -- Credentials and config; stored as JSONB so we can support
    -- both Woo (key/secret/url) and Shopify (domain/token) shapes.
    credentials JSONB NOT NULL DEFAULT '{}'::JSONB,
    status TEXT NOT NULL DEFAULT 'active',
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_connections_customer
    ON store_connections(customer_id, platform);

CREATE INDEX IF NOT EXISTS idx_store_connections_domain
    ON store_connections(store_domain);

-- Products and collections
CREATE TABLE IF NOT EXISTS store_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_connection_id UUID NOT NULL REFERENCES store_connections(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL,
    sku TEXT,
    name TEXT NOT NULL,
    description TEXT,
    price NUMERIC(12,2),
    currency TEXT,
    stock_qty INTEGER,
    url TEXT,
    image_url TEXT,
    meta JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (store_connection_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_store_products_connection
    ON store_products(store_connection_id);

CREATE INDEX IF NOT EXISTS idx_store_products_sku
    ON store_products(store_connection_id, sku);

CREATE INDEX IF NOT EXISTS idx_store_products_name
    ON store_products USING GIN ((to_tsvector('simple', coalesce(name, ''))));

CREATE TABLE IF NOT EXISTS store_collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_connection_id UUID NOT NULL REFERENCES store_connections(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (store_connection_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_store_collections_connection
    ON store_collections(store_connection_id);

CREATE TABLE IF NOT EXISTS store_product_collections (
    product_id UUID NOT NULL REFERENCES store_products(id) ON DELETE CASCADE,
    collection_id UUID NOT NULL REFERENCES store_collections(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, collection_id)
);

-- Customers and orders
CREATE TABLE IF NOT EXISTS store_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_connection_id UUID NOT NULL REFERENCES store_connections(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL,
    email TEXT,
    name TEXT,
    phone TEXT,
    meta JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (store_connection_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_store_customers_connection
    ON store_customers(store_connection_id);

CREATE INDEX IF NOT EXISTS idx_store_customers_email
    ON store_customers(store_connection_id, lower(email));

CREATE TABLE IF NOT EXISTS store_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_connection_id UUID NOT NULL REFERENCES store_connections(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL,
    status TEXT,
    currency TEXT,
    total NUMERIC(12,2),
    subtotal NUMERIC(12,2),
    created_at_shop TIMESTAMPTZ,
    updated_at_shop TIMESTAMPTZ,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    customer_external_id TEXT,
    email TEXT,
    meta JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (store_connection_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_store_orders_connection
    ON store_orders(store_connection_id);

CREATE INDEX IF NOT EXISTS idx_store_orders_email
    ON store_orders(store_connection_id, lower(email));

CREATE INDEX IF NOT EXISTS idx_store_orders_created_shop
    ON store_orders(store_connection_id, created_at_shop DESC);

-- Optional linkage from conversations/leads to a store connection + store customer
ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS store_connection_id UUID REFERENCES store_connections(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS store_customer_external_id TEXT;

ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS store_connection_id UUID REFERENCES store_connections(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS store_customer_external_id TEXT;

-- Triggers to keep updated_at current on new tables, reusing existing function
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_store_connections_updated_at'
    ) THEN
        CREATE TRIGGER update_store_connections_updated_at
        BEFORE UPDATE ON store_connections
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_store_products_updated_at'
    ) THEN
        CREATE TRIGGER update_store_products_updated_at
        BEFORE UPDATE ON store_products
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_store_collections_updated_at'
    ) THEN
        CREATE TRIGGER update_store_collections_updated_at
        BEFORE UPDATE ON store_collections
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_store_customers_updated_at'
    ) THEN
        CREATE TRIGGER update_store_customers_updated_at
        BEFORE UPDATE ON store_customers
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_store_orders_updated_at'
    ) THEN
        CREATE TRIGGER update_store_orders_updated_at
        BEFORE UPDATE ON store_orders
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    END IF;
END
$$;

