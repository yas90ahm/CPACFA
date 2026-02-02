-- Risk context: CFA liquidity warnings (Integration). Persisted when pool available; used for valuation prompts.

CREATE TABLE IF NOT EXISTS risk_context_liquidity_warnings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  period_label TEXT,
  session_id TEXT,
  source TEXT NOT NULL,
  risk_level TEXT,
  current_ratio NUMERIC,
  runway_months NUMERIC,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_context_liquidity_tenant_period ON risk_context_liquidity_warnings(tenant_id, period_label);
