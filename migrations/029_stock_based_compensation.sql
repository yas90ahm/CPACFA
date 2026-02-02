-- Stock-based compensation: grants, valuations, expense schedules (IFRS 2 / ASC 718)

CREATE TABLE IF NOT EXISTS stock_grants (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  grant_date DATE NOT NULL,
  grant_type TEXT NOT NULL, -- 'rsu' | 'option' | 'espp' | 'sar'
  recipient_id TEXT,
  recipient_name TEXT,
  shares_granted INTEGER NOT NULL,
  grant_price NUMERIC(15,2), -- strike price for options
  fair_value_per_share NUMERIC(15,2), -- grant date fair value
  vesting_type TEXT NOT NULL, -- 'time' | 'performance' | 'market'
  vesting_schedule JSONB NOT NULL, -- [{ date, shares, vested }]
  expiration_date DATE, -- for options
  status TEXT DEFAULT 'active', -- 'active' | 'vested' | 'forfeited' | 'exercised'
  forfeiture_date DATE,
  exercise_date DATE,
  exercise_price NUMERIC(15,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_grant_valuations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  grant_id TEXT REFERENCES stock_grants(id) ON DELETE CASCADE,
  valuation_date DATE NOT NULL,
  method TEXT NOT NULL, -- 'black_scholes' | 'grant_date_price' | 'monte_carlo'
  fair_value_per_share NUMERIC(15,2) NOT NULL,
  parameters JSONB, -- { volatility, riskFreeRate, expectedTerm, dividendYield }
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_expense_schedule (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  grant_id TEXT REFERENCES stock_grants(id) ON DELETE CASCADE,
  period_label TEXT NOT NULL,
  expense_amount NUMERIC(15,2) NOT NULL,
  cumulative_expense NUMERIC(15,2),
  shares_vested INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_grants_tenant ON stock_grants(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stock_grants_grant_date ON stock_grants(grant_date);
CREATE INDEX IF NOT EXISTS idx_stock_grant_valuations_grant ON stock_grant_valuations(grant_id);
CREATE INDEX IF NOT EXISTS idx_stock_expense_schedule_grant ON stock_expense_schedule(grant_id);
CREATE INDEX IF NOT EXISTS idx_stock_expense_schedule_period ON stock_expense_schedule(tenant_id, period_label);
