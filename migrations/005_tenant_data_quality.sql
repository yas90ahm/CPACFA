-- Data quality rules and exceptions (tenant schema).

CREATE TABLE IF NOT EXISTS data_quality_rules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  scope TEXT NOT NULL,
  type TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  severity TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dq_rules_tenant ON data_quality_rules(tenant_id);

CREATE TABLE IF NOT EXISTS data_quality_exceptions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  period_label TEXT,
  source_id TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  message TEXT NOT NULL,
  metric NUMERIC,
  severity TEXT NOT NULL,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dq_exceptions_tenant ON data_quality_exceptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dq_exceptions_period ON data_quality_exceptions(tenant_id, period_label);
CREATE INDEX IF NOT EXISTS idx_dq_exceptions_rule ON data_quality_exceptions(tenant_id, rule_id);
