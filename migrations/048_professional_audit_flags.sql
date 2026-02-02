-- Professional audit flags (Judgment Layer): flag-only, no auto-execute; human sign-off.

CREATE TABLE IF NOT EXISTS professional_audit_flags (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  period_label TEXT,
  run_id TEXT,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  citation_standard TEXT NOT NULL,
  citation_excerpt TEXT,
  source_document_id TEXT,
  source_document_line TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_professional_audit_flags_tenant_period ON professional_audit_flags(tenant_id, period_label);
CREATE INDEX IF NOT EXISTS idx_professional_audit_flags_tenant_run ON professional_audit_flags(tenant_id, run_id);
CREATE INDEX IF NOT EXISTS idx_professional_audit_flags_tenant_category ON professional_audit_flags(tenant_id, category);
CREATE INDEX IF NOT EXISTS idx_professional_audit_flags_tenant_status ON professional_audit_flags(tenant_id, status);
