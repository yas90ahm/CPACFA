-- OAuth tokens for accounting integrations.
-- Stores encrypted refresh tokens, access token metadata, and sync state.

CREATE TABLE IF NOT EXISTS tenant_oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  connection_id UUID NOT NULL REFERENCES accounting_connections(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('quickbooks', 'xero', 'netsuite')),

  -- Token data (access_token stored encrypted or as reference, never plaintext in prod)
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_type TEXT NOT NULL DEFAULT 'bearer',
  expires_at TIMESTAMPTZ,
  refresh_expires_at TIMESTAMPTZ,
  scope TEXT,

  -- Provider-specific identifiers
  realm_id TEXT,         -- QuickBooks company ID
  tenant_external_id TEXT, -- Xero/NetSuite tenant ID

  -- State
  last_refreshed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (tenant_id, connection_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_tokens_connection
  ON tenant_oauth_tokens(tenant_id, connection_id);

-- Sync schedule configuration
CREATE TABLE IF NOT EXISTS tenant_sync_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  connection_id UUID NOT NULL REFERENCES accounting_connections(id) ON DELETE CASCADE,

  frequency TEXT NOT NULL DEFAULT 'daily' CHECK (frequency IN ('hourly', 'daily', 'weekly', 'manual')),
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT CHECK (last_run_status IN ('success', 'partial', 'failed')),
  last_run_error TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (tenant_id, connection_id)
);
