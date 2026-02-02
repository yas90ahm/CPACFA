-- Audit trail per period/run: standard used, prior period, key assumptions (basis for numbers).

CREATE TABLE IF NOT EXISTS close_audit_trail (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  period_label TEXT NOT NULL,
  run_id TEXT,
  standard TEXT,
  prior_period_label TEXT,
  assumptions JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_close_audit_trail_tenant_period ON close_audit_trail(tenant_id, period_label);
