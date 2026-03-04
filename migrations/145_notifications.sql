-- Migration 145: Notification system for operating partner alerts
-- Supports in-app notifications, webhook delivery, and email (infrastructure only)

CREATE TABLE IF NOT EXISTS core.notifications (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  data JSONB,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON core.notifications (user_id, read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_tenant
  ON core.notifications (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS core.notification_preferences (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  in_app BOOLEAN DEFAULT TRUE,
  webhook BOOLEAN DEFAULT FALSE,
  email BOOLEAN DEFAULT FALSE,
  UNIQUE(tenant_id, user_id, event_type)
);

CREATE TABLE IF NOT EXISTS core.webhook_configs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  url VARCHAR(500) NOT NULL,
  secret VARCHAR(200),
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
