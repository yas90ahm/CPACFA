-- Risk context: unresolved CPA-CFA conflicts (Integration only). Resolved via Resolution Memo; export gate blocks until resolved.

CREATE TABLE IF NOT EXISTS risk_context_conflicts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  period_label TEXT,
  session_id TEXT,
  conflict_reason TEXT NOT NULL,
  conflict_snapshot JSONB NOT NULL DEFAULT '{}',
  resolved_at TIMESTAMPTZ,
  resolution_memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_risk_context_conflicts_tenant_period ON risk_context_conflicts(tenant_id, period_label);
CREATE INDEX IF NOT EXISTS idx_risk_context_conflicts_unresolved ON risk_context_conflicts(tenant_id, period_label) WHERE resolved_at IS NULL;
