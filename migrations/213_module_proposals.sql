-- Module proposal transparency: stores computation inputs + data quality flags
-- for each accounting module's proposed JE. Controller reviews before approving.

CREATE TABLE IF NOT EXISTS tenant_module_proposals (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  close_session_id TEXT NOT NULL,
  module_name TEXT NOT NULL,
  standard TEXT,
  status TEXT NOT NULL DEFAULT 'needs_review'
    CHECK (status IN ('needs_review', 'approved', 'skipped', 'not_applicable', 'failed')),
  je_id TEXT,
  computation_inputs JSONB NOT NULL DEFAULT '{}',
  data_quality_flags JSONB NOT NULL DEFAULT '[]',
  skip_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  UNIQUE(tenant_id, close_session_id, module_name)
);

CREATE INDEX IF NOT EXISTS idx_module_proposals_session
  ON tenant_module_proposals(tenant_id, close_session_id);
