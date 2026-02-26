-- User management: status, invitation, deactivation, last_active.
-- Run on control DB (tenants, users live here).

-- Users: add columns for team management (all optional/nullable for existing rows)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS invited_by TEXT,
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invitation_token TEXT;

-- Backfill name from email for existing users
UPDATE users SET name = COALESCE(TRIM(name), email) WHERE name IS NULL OR TRIM(name) = '';

-- Constrain status (add only if constraint does not exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'users'::regclass AND conname = 'chk_users_status'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT chk_users_status
      CHECK (status IN ('active', 'invited', 'deactivated'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_tenant_status ON users(tenant_id, status);

-- Portfolio access: operating partners can view multiple tenants
CREATE TABLE IF NOT EXISTS portfolio_access (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  granted_by TEXT REFERENCES users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_portfolio_access_user ON portfolio_access(user_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_access_tenant ON portfolio_access(tenant_id);
