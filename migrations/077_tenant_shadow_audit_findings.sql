-- Shadow Auditor pre-post findings: deterministic checks before JE post; queryable for binder.

CREATE TABLE IF NOT EXISTS tenant_shadow_audit_findings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         TEXT NOT NULL,
  period_label      TEXT NOT NULL,
  journal_entry_id  TEXT NOT NULL,
  run_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  severity          TEXT NOT NULL CHECK (severity IN ('ok','warn','block')),
  findings_json     JSONB NOT NULL DEFAULT '[]',
  actor_user_id     TEXT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_shadow_audit_findings_je
  ON tenant_shadow_audit_findings(tenant_id, journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_tenant_shadow_audit_findings_period
  ON tenant_shadow_audit_findings(tenant_id, period_label);
