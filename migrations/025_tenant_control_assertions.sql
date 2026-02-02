-- Control assertions: map controls to assertions/risks (audit risk mapping).

CREATE TABLE IF NOT EXISTS control_assertions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  control_id TEXT NOT NULL,
  assertion_label TEXT NOT NULL,
  risk_category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, control_id, assertion_label)
);

CREATE INDEX IF NOT EXISTS idx_control_assertions_tenant ON control_assertions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_control_assertions_control ON control_assertions(tenant_id, control_id);
