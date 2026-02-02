-- Equity method investments (IAS 28 / ASC 323)

CREATE TABLE IF NOT EXISTS equity_method_investments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  investee_name TEXT NOT NULL,
  investment_date DATE NOT NULL,
  ownership_percent NUMERIC(5,4) NOT NULL,
  initial_investment NUMERIC(15,2) NOT NULL,
  current_carrying_value NUMERIC(15,2),
  basis_difference NUMERIC(15,2),
  basis_difference_components JSONB, -- [{ description, amount, amortizationYears }]
  is_significant_influence BOOLEAN DEFAULT true,
  influence_basis TEXT, -- 'board_seat' | 'material_transactions' | 'ownership_20_50'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equity_method_income (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  investment_id TEXT REFERENCES equity_method_investments(id) ON DELETE CASCADE,
  period_label TEXT NOT NULL,
  investee_net_income NUMERIC(15,2),
  share_of_income NUMERIC(15,2),
  dividends_received NUMERIC(15,2),
  basis_difference_amortization NUMERIC(15,2),
  impairment_loss NUMERIC(15,2),
  net_equity_income NUMERIC(15,2),
  carrying_value_after NUMERIC(15,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equity_method_investments_tenant ON equity_method_investments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_equity_method_income_investment ON equity_method_income(investment_id);
