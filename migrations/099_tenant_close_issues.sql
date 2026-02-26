-- Unified HITL Issue table and append-only history (Step 4).
-- Lifecycle: DETECTED → ASSIGNED → IN_PROGRESS → RESOLVED → VERIFIED (or WAIVED).
-- Old tables (tenant_hitl_staging, issue_items) preserved for rollback; data migration in 100.

CREATE TABLE IF NOT EXISTS tenant_close_issues (
  issue_id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  tenant_id TEXT NOT NULL,
  period_id TEXT NOT NULL REFERENCES close_sessions(id),
  entity_id TEXT NOT NULL,

  -- Classification
  issue_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'blocking', 'warning', 'info')),
  category TEXT NOT NULL CHECK (category IN ('ingestion', 'reconciliation', 'adjustment', 'statement', 'review', 'general')),

  -- State
  status TEXT NOT NULL DEFAULT 'detected'
    CHECK (status IN ('detected', 'assigned', 'in_progress', 'resolved', 'verified', 'waived')),

  -- Detail
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  affected_accounts TEXT[] DEFAULT '{}',
  affected_amount NUMERIC(20,2),

  -- Source
  source_check TEXT,
  source_details JSONB DEFAULT '{}',

  -- Assignment
  assigned_to TEXT,
  assigned_at TIMESTAMPTZ,
  assigned_by TEXT,

  -- Resolution
  resolution_type TEXT,
  resolution_description TEXT,
  resolution_aje_id TEXT,
  resolution_recon_id TEXT,
  resolution_mapping_change JSONB,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,

  -- Verification
  verified_by TEXT,
  verified_at TIMESTAMPTZ,
  verification_method TEXT,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_close_issue_history (
  history_id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  issue_id TEXT NOT NULL REFERENCES tenant_close_issues(issue_id),
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  comment TEXT
);

CREATE INDEX IF NOT EXISTS idx_close_issues_tenant ON tenant_close_issues(tenant_id);
CREATE INDEX IF NOT EXISTS idx_close_issues_period ON tenant_close_issues(period_id);
CREATE INDEX IF NOT EXISTS idx_close_issues_status ON tenant_close_issues(status);
CREATE INDEX IF NOT EXISTS idx_close_issues_severity ON tenant_close_issues(severity);
CREATE INDEX IF NOT EXISTS idx_close_issues_type ON tenant_close_issues(issue_type);
CREATE INDEX IF NOT EXISTS idx_close_issues_period_status ON tenant_close_issues(period_id, status);
CREATE INDEX IF NOT EXISTS idx_close_issue_history_issue ON tenant_close_issue_history(issue_id);

-- Append-only: no UPDATE or DELETE on history
CREATE OR REPLACE FUNCTION prevent_issue_history_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Issue history is append-only. Updates and deletes are not permitted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS issue_history_immutable_update ON tenant_close_issue_history;
CREATE TRIGGER issue_history_immutable_update
  BEFORE UPDATE ON tenant_close_issue_history
  FOR EACH ROW EXECUTE FUNCTION prevent_issue_history_modification();

DROP TRIGGER IF EXISTS issue_history_immutable_delete ON tenant_close_issue_history;
CREATE TRIGGER issue_history_immutable_delete
  BEFORE DELETE ON tenant_close_issue_history
  FOR EACH ROW EXECUTE FUNCTION prevent_issue_history_modification();
