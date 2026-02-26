-- Certification artifacts: signed attestation for certified closes.
-- One artifact per close_session_id; tenant-scoped.

CREATE TABLE IF NOT EXISTS certification_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  close_session_id TEXT NOT NULL,
  period_label TEXT NOT NULL,
  artifact_json JSONB NOT NULL,
  artifact_hash TEXT NOT NULL,
  signature_b64 TEXT NOT NULL,
  public_key_b64 TEXT NOT NULL,
  alg TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, close_session_id)
);

CREATE INDEX IF NOT EXISTS idx_certification_artifacts_tenant ON certification_artifacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_certification_artifacts_close_session ON certification_artifacts(tenant_id, close_session_id);

-- Link close_sessions to artifact
ALTER TABLE close_sessions
  ADD COLUMN IF NOT EXISTS certification_artifact_id UUID;
