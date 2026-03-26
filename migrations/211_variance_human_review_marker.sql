-- Variance explanation human review marker.
-- AI-drafted explanations require explicit human attestation before certification.

ALTER TABLE tenant_variance_analysis
  ADD COLUMN IF NOT EXISTS human_reviewed_by TEXT NULL,
  ADD COLUMN IF NOT EXISTS human_reviewed_at TIMESTAMPTZ NULL;
