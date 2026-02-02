-- Earnings per share (ASC 260)

CREATE TABLE IF NOT EXISTS eps_calculations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  period_label TEXT NOT NULL,
  basic_income_available NUMERIC(15,2) NOT NULL,
  basic_weighted_shares NUMERIC(15,4) NOT NULL,
  basic_eps NUMERIC(10,4) NOT NULL,
  diluted_income_available NUMERIC(15,2) NOT NULL,
  diluted_weighted_shares NUMERIC(15,4) NOT NULL,
  diluted_eps NUMERIC(10,4) NOT NULL,
  treasury_stock_adjustments JSONB,
  convertible_adjustments JSONB,
  options_warrants JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eps_calculations_tenant_id ON eps_calculations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_eps_calculations_period ON eps_calculations(tenant_id, period_label);
