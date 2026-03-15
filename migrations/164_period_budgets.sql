-- Renumbered from 064 to 164 to resolve duplicate prefix
-- Period budgets: budget amounts by account/period/entity for budget-to-actual variance.

CREATE TABLE IF NOT EXISTS tenant_period_budgets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  period_label TEXT NOT NULL,
  account_code TEXT NOT NULL,
  account_name TEXT,
  budget_amount NUMERIC(20,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by TEXT,
  UNIQUE(tenant_id, entity_id, period_label, account_code)
);

CREATE INDEX IF NOT EXISTS idx_period_budgets_session ON tenant_period_budgets(tenant_id, entity_id, period_label);
