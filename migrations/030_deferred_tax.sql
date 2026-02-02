-- Deferred tax: temporary differences, valuation allowance, rate changes (IAS 12 / ASC 740)

CREATE TABLE IF NOT EXISTS deferred_tax_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  period_label TEXT NOT NULL,
  item_type TEXT NOT NULL, -- 'temporary_difference' | 'nol_carryforward' | 'tax_credit'
  description TEXT NOT NULL,
  book_basis NUMERIC(15,2),
  tax_basis NUMERIC(15,2),
  temporary_difference NUMERIC(15,2), -- book - tax
  tax_rate NUMERIC(5,4), -- e.g. 0.21 for 21%
  deferred_tax_asset NUMERIC(15,2),
  deferred_tax_liability NUMERIC(15,2),
  reversal_pattern TEXT, -- '1_year' | '2_5_years' | 'indefinite'
  source_account TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deferred_tax_valuation_allowance (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  period_label TEXT NOT NULL,
  deferred_tax_asset_gross NUMERIC(15,2) NOT NULL,
  valuation_allowance NUMERIC(15,2) NOT NULL,
  deferred_tax_asset_net NUMERIC(15,2) NOT NULL,
  assessment TEXT NOT NULL, -- 'more_likely_than_not' justification
  factors JSONB, -- { positiveSources: [], negativeSources: [] }
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deferred_tax_rate_changes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  period_label TEXT NOT NULL,
  old_rate NUMERIC(5,4),
  new_rate NUMERIC(5,4),
  enactment_date DATE,
  impact_amount NUMERIC(15,2), -- remeasurement impact
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deferred_tax_items_tenant_period ON deferred_tax_items(tenant_id, period_label);
CREATE INDEX IF NOT EXISTS idx_deferred_tax_valuation_tenant_period ON deferred_tax_valuation_allowance(tenant_id, period_label);
CREATE INDEX IF NOT EXISTS idx_deferred_tax_rate_changes_tenant_period ON deferred_tax_rate_changes(tenant_id, period_label);
