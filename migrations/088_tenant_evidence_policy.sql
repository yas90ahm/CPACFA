-- Evidence Anchoring Phase 2A: tenant-level evidence policy.

CREATE TABLE IF NOT EXISTS evidence_policy (
  tenant_id TEXT NOT NULL PRIMARY KEY,
  enforcement_mode TEXT NOT NULL DEFAULT 'off',
  materiality_threshold TEXT,
  required_assertion_types JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_evidence_policy_enforcement_mode CHECK (enforcement_mode IN ('off', 'warn_only', 'hard_block'))
);

COMMENT ON TABLE evidence_policy IS 'Tenant-level evidence policy for certification gate. Default: off.';
