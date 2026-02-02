-- Business combinations: acquisitions, PPA, goodwill, contingent consideration (IFRS 3 / ASC 805)

CREATE TABLE IF NOT EXISTS acquisitions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  acquisition_name TEXT NOT NULL,
  acquisition_date DATE NOT NULL,
  acquiree_name TEXT NOT NULL,
  purchase_price NUMERIC(15,2) NOT NULL,
  cash_consideration NUMERIC(15,2),
  stock_consideration NUMERIC(15,2),
  contingent_consideration NUMERIC(15,2),
  fair_value_net_assets NUMERIC(15,2),
  goodwill NUMERIC(15,2),
  bargain_purchase_gain NUMERIC(15,2),
  status TEXT DEFAULT 'in_progress', -- 'in_progress' | 'completed' | 'finalized'
  measurement_period_end DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ppa_line_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  acquisition_id TEXT REFERENCES acquisitions(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL, -- 'asset' | 'liability' | 'intangible'
  description TEXT NOT NULL,
  book_value NUMERIC(15,2),
  fair_value NUMERIC(15,2),
  fair_value_adjustment NUMERIC(15,2),
  valuation_method TEXT, -- 'cost' | 'market' | 'income' | 'relief_from_royalty'
  useful_life_years INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contingent_consideration (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  acquisition_id TEXT REFERENCES acquisitions(id) ON DELETE CASCADE,
  earn_out_type TEXT NOT NULL, -- 'revenue' | 'ebitda' | 'retention' | 'milestone'
  target_metric TEXT,
  target_value NUMERIC(15,2),
  max_payout NUMERIC(15,2),
  fair_value_at_acquisition NUMERIC(15,2),
  current_fair_value NUMERIC(15,2),
  probability_weighted BOOLEAN DEFAULT true,
  scenarios JSONB, -- [{ probability, payout }]
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acquisitions_tenant ON acquisitions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ppa_line_items_acquisition ON ppa_line_items(acquisition_id);
CREATE INDEX IF NOT EXISTS idx_contingent_consideration_acquisition ON contingent_consideration(acquisition_id);
