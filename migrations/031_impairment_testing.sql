-- Impairment testing: CGUs, goodwill allocation, impairment tests (IAS 36 / ASC 350)

CREATE TABLE IF NOT EXISTS cash_generating_units (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  cgu_name TEXT NOT NULL,
  description TEXT,
  allocation_basis TEXT, -- 'revenue' | 'headcount' | 'assets'
  segment_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS goodwill_allocation (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  cgu_id TEXT REFERENCES cash_generating_units(id) ON DELETE CASCADE,
  acquisition_date DATE,
  goodwill_amount NUMERIC(15,2) NOT NULL,
  allocation_rationale TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS impairment_tests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  period_label TEXT NOT NULL,
  test_date DATE NOT NULL,
  cgu_id TEXT REFERENCES cash_generating_units(id) ON DELETE SET NULL,
  asset_type TEXT NOT NULL, -- 'goodwill' | 'intangible' | 'ppe' | 'investment'
  asset_description TEXT,
  carrying_amount NUMERIC(15,2) NOT NULL,
  recoverable_amount NUMERIC(15,2) NOT NULL,
  impairment_loss NUMERIC(15,2),
  method TEXT NOT NULL, -- 'value_in_use' | 'fair_value_less_costs'
  assumptions JSONB, -- { discountRate, growthRate, cashFlows[] }
  qualitative_assessment TEXT,
  quantitative_required BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cgu_tenant ON cash_generating_units(tenant_id);
CREATE INDEX IF NOT EXISTS idx_goodwill_allocation_cgu ON goodwill_allocation(cgu_id);
CREATE INDEX IF NOT EXISTS idx_impairment_tests_tenant_period ON impairment_tests(tenant_id, period_label);
