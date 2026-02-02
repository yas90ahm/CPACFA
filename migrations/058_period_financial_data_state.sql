-- Last financial data update time per tenant+period (TB ingest / FS).
-- Used by Freshness Interlock: valuation blocked if data_updated_at > review_completed_at.

CREATE TABLE IF NOT EXISTS period_financial_data_state (
  tenant_id TEXT NOT NULL,
  period_label TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, period_label)
);

CREATE INDEX IF NOT EXISTS idx_period_financial_data_state_tenant ON period_financial_data_state(tenant_id);
