-- Precedent transactions analysis

CREATE TABLE IF NOT EXISTS precedent_analyses (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  target_company TEXT NOT NULL,
  analysis_date DATE NOT NULL,
  target_metrics JSONB,
  valuation_range JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS precedent_transactions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  analysis_id TEXT REFERENCES precedent_analyses(id) ON DELETE CASCADE,
  target_company TEXT NOT NULL,
  acquirer TEXT NOT NULL,
  announcement_date DATE NOT NULL,
  close_date DATE,
  transaction_value NUMERIC(15,2),
  target_revenue NUMERIC(15,2),
  target_ebitda NUMERIC(15,2),
  multiples JSONB, -- { evEbitda, evRevenue }
  deal_structure TEXT, -- 'cash' | 'stock' | 'mixed'
  control_premium NUMERIC(5,4),
  synergies NUMERIC(15,2),
  is_excluded BOOLEAN DEFAULT false,
  exclude_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_precedent_analyses_tenant ON precedent_analyses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_precedent_transactions_analysis ON precedent_transactions(analysis_id);
