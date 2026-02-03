-- Unadjusted trial balance per tenant+period (source: uploaded or synced).
-- One row per (tenant_id, period_label); upsert on save.

CREATE TABLE IF NOT EXISTS period_trial_balance (
  tenant_id TEXT NOT NULL,
  period_label TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('uploaded', 'synced')),
  entries JSONB NOT NULL DEFAULT '[]',
  uploaded_at TIMESTAMPTZ,
  uploaded_by TEXT,
  synced_at TIMESTAMPTZ,
  synced_by TEXT,
  file_name TEXT,
  connection_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, period_label)
);

CREATE INDEX IF NOT EXISTS idx_period_trial_balance_tenant ON period_trial_balance(tenant_id);
CREATE INDEX IF NOT EXISTS idx_period_trial_balance_period ON period_trial_balance(tenant_id, period_label);
