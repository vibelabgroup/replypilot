-- Migration: 001_initial.sql
-- Complete database schema for Replypilot Production System

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- ENUM TYPES
-- ============================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('customer', 'admin');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'customer_status') THEN
        CREATE TYPE customer_status AS ENUM ('trial', 'active', 'paused', 'cancelled', 'delinquent');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
        CREATE TYPE subscription_status AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'conversation_status') THEN
        CREATE TYPE conversation_status AS ENUM ('active', 'closed', 'follow_up', 'converted');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_qualification') THEN
        CREATE TYPE lead_qualification AS ENUM ('hot', 'warm', 'cold', 'unqualified');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_direction') THEN
        CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sender_enum') THEN
        CREATE TYPE sender_enum AS ENUM ('lead', 'ai', 'system');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_enum') THEN
        CREATE TYPE delivery_enum AS ENUM ('pending', 'sent', 'delivered', 'failed', 'bounced');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_source') THEN
        CREATE TYPE lead_source AS ENUM ('sms', 'call', 'email', 'website', 'referral');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_state') THEN
        CREATE TYPE job_state AS ENUM ('pending', 'processing', 'completed', 'failed', 'dead');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_type') THEN
        CREATE TYPE job_type AS ENUM ('sms_send', 'ai_generate', 'notification_send', 'digest_send', 'webhook_process');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'webhook_provider') THEN
        CREATE TYPE webhook_provider AS ENUM ('stripe', 'twilio');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'webhook_status') THEN
        CREATE TYPE webhook_status AS ENUM ('pending', 'processing', 'completed', 'failed');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'digest_type') THEN
        CREATE TYPE digest_type AS ENUM ('hourly', 'daily', 'weekly');
    END IF;
END
$$;

-- ============================================
-- CORE TABLES
-- ============================================

-- Customers (tenants)
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stripe_customer_id VARCHAR(255) UNIQUE,
    stripe_subscription_id VARCHAR(255) UNIQUE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(50),
    status customer_status DEFAULT 'trial',
    subscription_status subscription_status DEFAULT 'trialing',
    current_period_start TIMESTAMP WITH TIME ZONE,
    current_period_end TIMESTAMP WITH TIME ZONE,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    trial_end TIMESTAMP WITH TIME ZONE,
    billing_address JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_stripe_customer_id ON customers(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_stripe_subscription_id ON customers(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);

-- Users (authentication)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role user_role DEFAULT 'customer',
    email_verified BOOLEAN DEFAULT FALSE,
    email_verified_at TIMESTAMP WITH TIME ZONE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    password_reset_token VARCHAR(255),
    password_reset_expires TIMESTAMP WITH TIME ZONE,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_customer_id ON users(customer_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_password_reset ON users(password_reset_token) WHERE password_reset_token IS NOT NULL;

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    revoked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at) WHERE NOT revoked;

-- Stripe Events (idempotency)
CREATE TABLE IF NOT EXISTS stripe_events (
    id VARCHAR(255) PRIMARY KEY,
    type VARCHAR(100) NOT NULL,
    data JSONB NOT NULL,
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_type ON stripe_events(type);
CREATE INDEX IF NOT EXISTS idx_stripe_events_processed ON stripe_events(processed);

-- Company Settings
CREATE TABLE IF NOT EXISTS company_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    company_name VARCHAR(255) NOT NULL,
    website VARCHAR(255),
    industry VARCHAR(100),
    address TEXT,
    city VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(2) DEFAULT 'DK',
    business_hours JSONB DEFAULT '{"monday": {"open": "08:00", "close": "17:00"}, "tuesday": {"open": "08:00", "close": "17:00"}, "wednesday": {"open": "08:00", "close": "17:00"}, "thursday": {"open": "08:00", "close": "17:00"}, "friday": {"open": "08:00", "close": "17:00"}, "saturday": {"open": "", "close": ""}, "sunday": {"open": "", "close": ""}}',
    timezone VARCHAR(50) DEFAULT 'Europe/Copenhagen',
    logo_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(customer_id)
);

CREATE INDEX IF NOT EXISTS idx_company_settings_customer_id ON company_settings(customer_id);

-- AI Settings
CREATE TABLE IF NOT EXISTS ai_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    system_prompt TEXT,
    temperature DECIMAL(3,2) DEFAULT 0.7 CHECK (temperature >= 0 AND temperature <= 2),
    max_tokens INTEGER DEFAULT 500,
    response_tone VARCHAR(50) DEFAULT 'professional',
    language VARCHAR(10) DEFAULT 'da',
    enable_greetings BOOLEAN DEFAULT TRUE,
    greeting_template TEXT,
    enable_closings BOOLEAN DEFAULT TRUE,
    closing_template TEXT,
    auto_response_enabled BOOLEAN DEFAULT TRUE,
    auto_response_delay_seconds INTEGER DEFAULT 30,
    working_hours_only BOOLEAN DEFAULT FALSE,
    fallback_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(customer_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_settings_customer_id ON ai_settings(customer_id);

-- Routing Rules
CREATE TABLE IF NOT EXISTS routing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    priority INTEGER DEFAULT 0,
    condition_type VARCHAR(50) NOT NULL, -- 'keyword', 'time', 'sender', 'content_regex'
    condition_value TEXT NOT NULL,
    action VARCHAR(50) NOT NULL, -- 'forward', 'tag', 'auto_reply', 'notify', 'block'
    action_config JSONB NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_routing_rules_customer_id ON routing_rules(customer_id);
CREATE INDEX IF NOT EXISTS idx_routing_rules_active ON routing_rules(customer_id, is_active);

-- SMS Templates
CREATE TABLE IF NOT EXISTS sms_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL, -- 'greeting', 'response', 'follow_up', 'notification'
    content TEXT NOT NULL,
    variables JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT TRUE,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_templates_customer_id ON sms_templates(customer_id);
CREATE INDEX IF NOT EXISTS idx_sms_templates_category ON sms_templates(customer_id, category);

-- Twilio Phone Numbers
CREATE TABLE IF NOT EXISTS twilio_numbers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    phone_number VARCHAR(50) NOT NULL UNIQUE,
    twilio_sid VARCHAR(255) NOT NULL,
    twilio_friendly_name VARCHAR(255),
    capabilities JSONB DEFAULT '{"voice": true, "sms": true, "mms": false}',
    is_active BOOLEAN DEFAULT TRUE,
    monthly_cost DECIMAL(10,2) DEFAULT 0,
    purchased_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    released_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_twilio_numbers_customer_id ON twilio_numbers(customer_id);
CREATE INDEX IF NOT EXISTS idx_twilio_numbers_phone ON twilio_numbers(phone_number);

-- ============================================
-- CONVERSATION & MESSAGING TABLES
-- ============================================

-- Conversations
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    twilio_number_id UUID REFERENCES twilio_numbers(id),
    lead_name VARCHAR(255),
    lead_phone VARCHAR(50) NOT NULL,
    lead_email VARCHAR(255),
    lead_source lead_source DEFAULT 'sms',
    status conversation_status DEFAULT 'active',
    last_message_at TIMESTAMP WITH TIME ZONE,
    message_count INTEGER DEFAULT 0,
    ai_response_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_customer_id ON conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_lead_phone ON conversations(lead_phone);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(last_message_at DESC);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    direction message_direction NOT NULL,
    sender sender_enum NOT NULL,
    content TEXT NOT NULL,
    twilio_message_sid VARCHAR(255),
    twilio_status VARCHAR(50),
    delivery_status delivery_enum DEFAULT 'pending',
    delivery_error TEXT,
    ai_generation_id UUID,
    cost DECIMAL(10,4),
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_twilio_sid ON messages(twilio_message_sid) WHERE twilio_message_sid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);

-- Leads
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    name VARCHAR(255),
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(255),
    source lead_source DEFAULT 'sms',
    qualification lead_qualification,
    estimated_value DECIMAL(12,2),
    notes TEXT,
    tags JSONB DEFAULT '[]',
    converted_at TIMESTAMP WITH TIME ZONE,
    converted_value DECIMAL(12,2),
    first_contact_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_contact_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_customer_id ON leads(customer_id);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_conversation ON leads(conversation_id);
CREATE INDEX IF NOT EXISTS idx_leads_qualification ON leads(customer_id, qualification);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);

-- ============================================
-- NOTIFICATION TABLES
-- ============================================

-- Notification Preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- Email notifications
    email_enabled BOOLEAN DEFAULT TRUE,
    email_new_lead BOOLEAN DEFAULT TRUE,
    email_new_message BOOLEAN DEFAULT FALSE,
    email_daily_digest BOOLEAN DEFAULT TRUE,
    email_weekly_report BOOLEAN DEFAULT TRUE,
    
    -- SMS notifications
    sms_enabled BOOLEAN DEFAULT FALSE,
    sms_phone VARCHAR(50),
    sms_new_lead BOOLEAN DEFAULT TRUE,
    sms_new_message BOOLEAN DEFAULT FALSE,
    
    -- Digest settings
    digest_type digest_type DEFAULT 'daily',
    digest_time TIME DEFAULT '09:00',
    
    -- Real-time settings
    webhook_url TEXT,
    webhook_secret VARCHAR(255),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(customer_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_prefs_customer_id ON notification_preferences(customer_id);
CREATE INDEX IF NOT EXISTS idx_notification_prefs_user_id ON notification_preferences(user_id);

-- Notifications Queue (job tracking)
CREATE TABLE IF NOT EXISTS notification_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'new_lead', 'new_message', 'digest', 'alert'
    channel VARCHAR(20) NOT NULL, -- 'email', 'sms', 'webhook'
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'sent', 'failed'
    payload JSONB NOT NULL,
    error_message TEXT,
    scheduled_for TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_queue_status ON notification_queue(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_notification_queue_customer ON notification_queue(customer_id, status);

-- ============================================
-- JOB QUEUE TABLES
-- ============================================

-- Job Queue (main queue for async processing)
CREATE TABLE IF NOT EXISTS job_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type job_type NOT NULL,
    payload JSONB NOT NULL,
    priority INTEGER DEFAULT 5,
    state job_state DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    error_message TEXT,
    error_stack TEXT,
    locked_by VARCHAR(255),
    locked_at TIMESTAMP WITH TIME ZONE,
    processed_at TIMESTAMP WITH TIME ZONE,
    scheduled_for TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_queue_state ON job_queue(state, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_job_queue_type ON job_queue(type, state);
CREATE INDEX IF NOT EXISTS idx_job_queue_locked ON job_queue(locked_by, locked_at) WHERE locked_by IS NOT NULL;

-- Dead Letter Queue (failed jobs)
CREATE TABLE IF NOT EXISTS dead_letter_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_job_id UUID,
    type job_type NOT NULL,
    payload JSONB NOT NULL,
    error_message TEXT,
    error_stack TEXT,
    failed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    retry_count INTEGER DEFAULT 0,
    archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dlq_archived ON dead_letter_queue(archived, created_at);
CREATE INDEX IF NOT EXISTS idx_dlq_type ON dead_letter_queue(type, failed_at);

-- Webhook Events (generic webhook tracking)
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider webhook_provider NOT NULL,
    event_id VARCHAR(255),
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    signature VARCHAR(255),
    status webhook_status DEFAULT 'pending',
    processed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_provider ON webhook_events(provider, event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON webhook_events(status, created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON webhook_events(provider, event_id) WHERE event_id IS NOT NULL;

-- ============================================
-- ANALYTICS TABLES
-- ============================================

-- Daily Stats (aggregated metrics)
CREATE TABLE IF NOT EXISTS daily_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    
    -- Conversation metrics
    conversations_started INTEGER DEFAULT 0,
    conversations_closed INTEGER DEFAULT 0,
    total_messages INTEGER DEFAULT 0,
    ai_messages INTEGER DEFAULT 0,
    
    -- Lead metrics
    new_leads INTEGER DEFAULT 0,
    qualified_leads INTEGER DEFAULT 0,
    converted_leads INTEGER DEFAULT 0,
    
    -- Response metrics
    avg_response_time_seconds INTEGER,
    first_response_time_seconds INTEGER,
    
    -- Cost metrics
    twilio_cost DECIMAL(10,4) DEFAULT 0,
    ai_cost DECIMAL(10,4) DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(customer_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_stats_customer_date ON daily_stats(customer_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date DESC);

-- ============================================
-- AUDIT LOG
-- ============================================

-- Audit Log (for admin/security)
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL, -- 'customer', 'user', 'conversation', 'lead', 'settings'
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_customer ON audit_log(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action, entity_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update triggers
DO $$
DECLARE
    tables TEXT[] := ARRAY['customers', 'users', 'sessions', 'company_settings', 'ai_settings', 'routing_rules', 'sms_templates', 'twilio_numbers', 'conversations', 'leads', 'notification_preferences', 'notification_queue', 'job_queue', 'daily_stats'];
    t TEXT;
BEGIN
    FOREACH t IN ARRAY tables
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS update_%s_updated_at ON %s', t, t);
        EXECUTE format('CREATE TRIGGER update_%s_updated_at BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', t, t);
    END LOOP;
END
$$;

-- Update conversation last_message_at function
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE conversations 
    SET last_message_at = NEW.created_at,
        message_count = message_count + 1,
        updated_at = NOW()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_conversation_on_message ON messages;
CREATE TRIGGER update_conversation_on_message
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_last_message();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on all tenant tables
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE twilio_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;

-- Create policy for customer isolation
CREATE POLICY customer_isolation ON company_settings
    USING (customer_id = current_setting('app.current_customer_id')::UUID);

-- Admin bypass (use with care)
CREATE POLICY admin_bypass ON company_settings
    USING (current_setting('app.is_admin')::BOOLEAN = TRUE);

-- Seed admin user (run after migrations)
-- INSERT INTO customers (id, name, email, status) VALUES 
--     ('00000000-0000-0000-0000-000000000000', 'Admin', 'admin@replypilot.dk', 'active');
-- INSERT INTO users (customer_id, email, password_hash, role) VALUES 
--     ('00000000-0000-0000-0000-000000000000', 'admin@replypilot.dk', '$2a$10$...hashed...', 'admin');