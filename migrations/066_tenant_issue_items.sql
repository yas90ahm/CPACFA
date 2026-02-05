-- Issue (Exception) items tied to close_session_id.
-- Anomalies, low-confidence classification, imbalance, missing data, recon mismatch become Issues.

CREATE TABLE IF NOT EXISTS issue_items (
  id TEXT PRIMARY KEY,
  close_session_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  description TEXT,
  impact_pl NUMERIC,
  impact_bs NUMERIC,
  impact_cash NUMERIC,
  currency TEXT,
  materiality_estimate NUMERIC,
  materiality_threshold_used NUMERIC,
  confidence_score NUMERIC,
  source_ref JSONB,
  assigned_to TEXT,
  due_date DATE,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_issue_category CHECK (category IN (
    'intake', 'classification', 'reconciliation', 'posting', 'policy', 'presentation', 'export_blocker'
  )),
  CONSTRAINT chk_issue_severity CHECK (severity IN ('low', 'med', 'high', 'critical')),
  CONSTRAINT chk_issue_status CHECK (status IN (
    'open', 'in_progress', 'needs_info', 'needs_approval', 'resolved', 'wont_fix'
  )),
  CONSTRAINT chk_confidence_score CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1))
);

CREATE INDEX IF NOT EXISTS idx_issue_items_close_session ON issue_items(close_session_id);
CREATE INDEX IF NOT EXISTS idx_issue_items_tenant ON issue_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_issue_items_tenant_status ON issue_items(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_issue_items_tenant_category ON issue_items(tenant_id, category);
CREATE INDEX IF NOT EXISTS idx_issue_items_assigned_to ON issue_items(tenant_id, assigned_to) WHERE assigned_to IS NOT NULL;
