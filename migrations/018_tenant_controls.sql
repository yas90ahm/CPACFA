-- Close controls catalogue per tenant (control definitions).
-- control_evidence links rec/sampling/PBC evidence to controls.

CREATE TABLE IF NOT EXISTS close_controls (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  owner TEXT,
  frequency TEXT,
  evidence_type TEXT
);

CREATE INDEX IF NOT EXISTS idx_close_controls_tenant ON close_controls(tenant_id);

CREATE TABLE IF NOT EXISTS control_evidence (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  control_id TEXT NOT NULL,
  evidence_type TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  period_label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_control_evidence_tenant ON control_evidence(tenant_id);
CREATE INDEX IF NOT EXISTS idx_control_evidence_control ON control_evidence(control_id);
CREATE INDEX IF NOT EXISTS idx_control_evidence_period ON control_evidence(tenant_id, period_label);
