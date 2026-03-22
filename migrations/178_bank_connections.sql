-- Migration 178: Bank connections for automated reconciliation.
-- Stores Plaid/MX/Yodlee access tokens and GL account mappings.
-- Enables auto-pull of ending balances for reconciliation.

CREATE TABLE IF NOT EXISTS bank_connections (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('plaid', 'mx', 'yodlee')),
  -- Access token (encrypted at rest by application; stored as text here)
  access_token TEXT NOT NULL,
  institution_name TEXT NOT NULL,
  -- JSON array of {glAccountCode, providerAccountId, accountName, accountLast4}
  account_mappings JSONB NOT NULL DEFAULT '[]',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_sync_at TIMESTAMPTZ,
  last_sync_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_bank_connections_tenant ON bank_connections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bank_connections_active ON bank_connections(tenant_id, active) WHERE active = true;
