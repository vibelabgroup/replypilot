-- Migration: 011_shopify_multi_store_limits.sql
-- Multi-store limits per customer and per-store support emails

-- Add per-customer Shopify / store integrations feature flags and limits
ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS shopify_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS max_store_connections INTEGER;

-- Add per-store support email addresses (one or more) for routing
ALTER TABLE store_connections
    ADD COLUMN IF NOT EXISTS support_emails TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

