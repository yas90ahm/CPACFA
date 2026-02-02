-- Comparable company analysis: analyses, comparable companies, valuation ranges

CREATE TABLE IF NOT EXISTS comparable_analyses (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  target_company TEXT NOT NULL,
  analysis_date DATE NOT NULL,
  target_metrics JSONB, -- { revenue, ebitda, netIncome, bookValue, shares }
  valuation_metrics JSONB, -- { evEbitda, evRevenue, pe, pb }
  valuation_range JSONB, -- { low, median, high }
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comparable_companies (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  analysis_id TEXT REFERENCES comparable_analyses(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  ticker TEXT,
  market_cap NUMERIC(15,2),
  enterprise_value NUMERIC(15,2),
  revenue NUMERIC(15,2),
  ebitda NUMERIC(15,2),
  net_income NUMERIC(15,2),
  book_value NUMERIC(15,2),
  multiples JSONB, -- { evEbitda, evRevenue, pe, pb }
  is_outlier BOOLEAN DEFAULT false,
  outlier_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comparable_analyses_tenant ON comparable_analyses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_comparable_companies_analysis ON comparable_companies(analysis_id);
