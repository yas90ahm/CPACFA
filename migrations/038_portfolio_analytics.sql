-- Portfolio analytics: portfolios, positions, performance

CREATE TABLE IF NOT EXISTS portfolios (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  portfolio_name TEXT NOT NULL,
  benchmark TEXT,
  target_allocation JSONB, -- { equities: 0.6, fixed_income: 0.3, alternatives: 0.1 }
  inception_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portfolio_positions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  portfolio_id TEXT REFERENCES portfolios(id) ON DELETE CASCADE,
  asset_name TEXT NOT NULL,
  asset_class TEXT NOT NULL, -- 'equities' | 'fixed_income' | 'alternatives' | 'cash'
  ticker TEXT,
  quantity NUMERIC(15,4),
  cost_basis NUMERIC(15,2),
  current_value NUMERIC(15,2),
  weight NUMERIC(5,4),
  as_of_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portfolio_performance (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  portfolio_id TEXT REFERENCES portfolios(id) ON DELETE CASCADE,
  period_label TEXT NOT NULL,
  total_return NUMERIC(10,6),
  benchmark_return NUMERIC(10,6),
  excess_return NUMERIC(10,6),
  sharpe_ratio NUMERIC(10,6),
  sortino_ratio NUMERIC(10,6),
  beta NUMERIC(10,6),
  alpha NUMERIC(10,6),
  volatility NUMERIC(10,6),
  max_drawdown NUMERIC(10,6),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portfolios_tenant ON portfolios(tenant_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_positions_portfolio ON portfolio_positions(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_performance_portfolio ON portfolio_performance(portfolio_id);
