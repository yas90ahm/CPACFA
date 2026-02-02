-- DCF valuations: models, WACC calculations, sensitivity analysis

CREATE TABLE IF NOT EXISTS dcf_models (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  company_name TEXT NOT NULL,
  valuation_date DATE NOT NULL,
  projection_years INTEGER DEFAULT 5,
  terminal_growth_rate NUMERIC(5,4),
  wacc NUMERIC(5,4),
  cash_flows JSONB NOT NULL, -- [{ year, fcf }]
  terminal_value NUMERIC(15,2),
  pv_cash_flows NUMERIC(15,2),
  pv_terminal_value NUMERIC(15,2),
  enterprise_value NUMERIC(15,2),
  net_debt NUMERIC(15,2),
  equity_value NUMERIC(15,2),
  shares_outstanding INTEGER,
  value_per_share NUMERIC(15,2),
  assumptions JSONB, -- { revenueGrowth[], margins[], capex[] }
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wacc_calculations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  dcf_model_id TEXT REFERENCES dcf_models(id) ON DELETE CASCADE,
  cost_of_equity NUMERIC(5,4),
  cost_of_debt NUMERIC(5,4),
  market_risk_premium NUMERIC(5,4),
  risk_free_rate NUMERIC(5,4),
  beta NUMERIC(5,4),
  tax_rate NUMERIC(5,4),
  debt_weight NUMERIC(5,4),
  equity_weight NUMERIC(5,4),
  wacc NUMERIC(5,4),
  rationale TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dcf_sensitivity (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  dcf_model_id TEXT REFERENCES dcf_models(id) ON DELETE CASCADE,
  wacc_values JSONB, -- [0.08, 0.09, 0.10, ...]
  growth_values JSONB, -- [0.01, 0.015, 0.02, ...]
  value_matrix JSONB, -- [[val1, val2, ...], ...]
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dcf_models_tenant ON dcf_models(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wacc_calculations_dcf ON wacc_calculations(dcf_model_id);
CREATE INDEX IF NOT EXISTS idx_dcf_sensitivity_dcf ON dcf_sensitivity(dcf_model_id);
