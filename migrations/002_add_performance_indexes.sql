-- Add performance indexes for frequently queried columns
-- This migration improves query performance for common operations

-- Indexes for customers table
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_subscription_status ON customers(subscription_status);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_stripe_customer_id ON customers(stripe_customer_id);

-- Indexes for users table
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_customer_id ON users(customer_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_locked_until ON users(locked_until) WHERE locked_until IS NOT NULL;

-- Indexes for sessions table
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_revoked ON sessions(revoked) WHERE revoked = false;

-- Indexes for conversations table
CREATE INDEX IF NOT EXISTS idx_conversations_customer_id ON conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_channel ON conversations(channel);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON conversations(last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_conversations_email_account_id ON conversations(email_account_id);
CREATE INDEX IF NOT EXISTS idx_conversations_twilio_number_id ON conversations(twilio_number_id);
CREATE INDEX IF NOT EXISTS idx_conversations_fonecloud_number_id ON conversations(fonecloud_number_id);

-- Indexes for messages table
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_direction ON messages(direction);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender);
CREATE INDEX IF NOT EXISTS idx_messages_email_message_id ON messages(email_message_id);

-- Indexes for leads table
CREATE INDEX IF NOT EXISTS idx_leads_customer_id ON leads(customer_id);
CREATE INDEX IF NOT EXISTS idx_leads_conversation_id ON leads(conversation_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);

-- Indexes for email_accounts table
CREATE INDEX IF NOT EXISTS idx_email_accounts_customer_id ON email_accounts(customer_id);
CREATE INDEX IF NOT EXISTS idx_email_accounts_status ON email_accounts(status);
CREATE INDEX IF NOT EXISTS idx_email_accounts_provider ON email_accounts(provider);
CREATE INDEX IF NOT EXISTS idx_email_accounts_email_address ON email_accounts(email_address);
CREATE INDEX IF NOT EXISTS idx_email_accounts_next_sync_at ON email_accounts(next_sync_at) WHERE next_sync_at IS NOT NULL;

-- Indexes for email_messages table
CREATE INDEX IF NOT EXISTS idx_email_messages_customer_id ON email_messages(customer_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_conversation_id ON email_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_received_at ON email_messages(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_messages_provider_message_id ON email_messages(provider_message_id);

-- Indexes for email_drafts table
CREATE INDEX IF NOT EXISTS idx_email_drafts_customer_id ON email_drafts(customer_id);
CREATE INDEX IF NOT EXISTS idx_email_drafts_email_account_id ON email_drafts(email_account_id);
CREATE INDEX IF NOT EXISTS idx_email_drafts_email_message_id ON email_drafts(email_message_id);
CREATE INDEX IF NOT EXISTS idx_email_drafts_status ON email_drafts(status);
CREATE INDEX IF NOT EXISTS idx_email_drafts_created_at ON email_drafts(created_at DESC);

-- Indexes for twilio_numbers table
CREATE INDEX IF NOT EXISTS idx_twilio_numbers_customer_id ON twilio_numbers(customer_id);
CREATE INDEX IF NOT EXISTS idx_twilio_numbers_is_active ON twilio_numbers(is_active);
CREATE INDEX IF NOT EXISTS idx_twilio_numbers_phone_number ON twilio_numbers(phone_number);

-- Indexes for fonecloud_numbers table
CREATE INDEX IF NOT EXISTS idx_fonecloud_numbers_customer_id ON fonecloud_numbers(customer_id);
CREATE INDEX IF NOT EXISTS idx_fonecloud_numbers_is_active ON fonecloud_numbers(is_active);
CREATE INDEX IF NOT EXISTS idx_fonecloud_numbers_phone_number ON fonecloud_numbers(phone_number);

-- Indexes for company_settings table
CREATE INDEX IF NOT EXISTS idx_company_settings_customer_id ON company_settings(customer_id);

-- Indexes for ai_settings table
CREATE INDEX IF NOT EXISTS idx_ai_settings_customer_id ON ai_settings(customer_id);

-- Indexes for notification_preferences table
CREATE INDEX IF NOT EXISTS idx_notification_preferences_customer_id ON notification_preferences(customer_id);
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_id ON notification_preferences(user_id);

-- Indexes for routing_rules table
CREATE INDEX IF NOT EXISTS idx_routing_rules_customer_id ON routing_rules(customer_id);
CREATE INDEX IF NOT EXISTS idx_routing_rules_priority ON routing_rules(priority DESC);

-- Indexes for sms_templates table
CREATE INDEX IF NOT EXISTS idx_sms_templates_customer_id ON sms_templates(customer_id);
CREATE INDEX IF NOT EXISTS idx_sms_templates_category ON sms_templates(category);

-- Indexes for stripe_events table
CREATE INDEX IF NOT EXISTS idx_stripe_events_id ON stripe_events(id);

-- Indexes for system_settings table
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(key);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_conversations_customer_status ON conversations(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_conversations_customer_channel ON conversations(customer_id, channel);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_drafts_customer_status ON email_drafts(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_email_accounts_customer_status ON email_accounts(customer_id, status);
