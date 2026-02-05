-- Shadow Auditor AI metadata: confidence, prompt_version, model (nullable) for AI-run findings.

ALTER TABLE tenant_shadow_audit_findings
  ADD COLUMN IF NOT EXISTS confidence NUMERIC,
  ADD COLUMN IF NOT EXISTS prompt_version TEXT,
  ADD COLUMN IF NOT EXISTS model TEXT;
