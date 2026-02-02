-- LBO models (CFA)

CREATE TABLE IF NOT EXISTS lbo_models (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  target_name TEXT,
  entry_ev NUMERIC(15,2),
  entry_multiple_metric TEXT,
  entry_multiple NUMERIC(10,2),
  exit_year INT,
  exit_multiple NUMERIC(10,2),
  debt_amount NUMERIC(15,2),
  equity_amount NUMERIC(15,2),
  irr NUMERIC(10,4),
  moic NUMERIC(10,4),
  assumptions JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lbo_models_tenant_id ON lbo_models(tenant_id);
