-- Segment reporting: operating segments, financials, reconciliation (IFRS 8 / ASC 280)

CREATE TABLE IF NOT EXISTS operating_segments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  segment_name TEXT NOT NULL,
  description TEXT,
  codm_report_basis TEXT, -- which report CODM uses
  aggregation_criteria TEXT,
  is_reportable BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS segment_financials (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  segment_id TEXT REFERENCES operating_segments(id) ON DELETE CASCADE,
  period_label TEXT NOT NULL,
  revenue NUMERIC(15,2),
  intersegment_revenue NUMERIC(15,2) DEFAULT 0,
  external_revenue NUMERIC(15,2),
  profit_loss NUMERIC(15,2),
  assets NUMERIC(15,2),
  liabilities NUMERIC(15,2),
  capital_expenditures NUMERIC(15,2),
  depreciation NUMERIC(15,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS segment_reconciliation (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  period_label TEXT NOT NULL,
  item_type TEXT NOT NULL, -- 'revenue' | 'profit' | 'assets'
  segment_total NUMERIC(15,2),
  consolidated_total NUMERIC(15,2),
  reconciling_items JSONB, -- [{ description, amount }]
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operating_segments_tenant ON operating_segments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_segment_financials_segment_period ON segment_financials(segment_id, period_label);
CREATE INDEX IF NOT EXISTS idx_segment_reconciliation_tenant_period ON segment_reconciliation(tenant_id, period_label);
