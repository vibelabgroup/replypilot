-- Migration: 008_notification_cadence.sql
-- Adds flexible notification cadence support with digest buckets.

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS cadence_mode VARCHAR(20) NOT NULL DEFAULT 'immediate',
  ADD COLUMN IF NOT EXISTS cadence_interval_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS max_notifications_per_day INTEGER,
  ADD COLUMN IF NOT EXISTS quiet_hours_start TIME,
  ADD COLUMN IF NOT EXISTS quiet_hours_end TIME,
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Copenhagen',
  ADD COLUMN IF NOT EXISTS notify_lead_managed BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_lead_converted BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_ai_failed BOOLEAN NOT NULL DEFAULT TRUE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notification_preferences_cadence_mode_check'
  ) THEN
    ALTER TABLE notification_preferences
      ADD CONSTRAINT notification_preferences_cadence_mode_check
      CHECK (cadence_mode IN ('immediate', 'hourly', 'daily', 'custom'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notification_preferences_cadence_interval_check'
  ) THEN
    ALTER TABLE notification_preferences
      ADD CONSTRAINT notification_preferences_cadence_interval_check
      CHECK (
        cadence_interval_minutes IS NULL
        OR (cadence_interval_minutes >= 5 AND cadence_interval_minutes <= 1440)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notification_preferences_max_daily_check'
  ) THEN
    ALTER TABLE notification_preferences
      ADD CONSTRAINT notification_preferences_max_daily_check
      CHECK (
        max_notifications_per_day IS NULL
        OR (max_notifications_per_day >= 1 AND max_notifications_per_day <= 200)
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS notification_digest_buckets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id TEXT NOT NULL,
  user_id TEXT,
  channel VARCHAR(20) NOT NULL,
  event_types JSONB NOT NULL DEFAULT '[]',
  events JSONB NOT NULL DEFAULT '[]',
  event_count INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  window_start TIMESTAMP WITH TIME ZONE NOT NULL,
  window_end TIMESTAMP WITH TIME ZONE NOT NULL,
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_digest_buckets_due
  ON notification_digest_buckets(status, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_notification_digest_buckets_customer
  ON notification_digest_buckets(customer_id, status, window_end DESC);

CREATE INDEX IF NOT EXISTS idx_notification_digest_buckets_window
  ON notification_digest_buckets(customer_id, user_id, channel, window_start, window_end);
