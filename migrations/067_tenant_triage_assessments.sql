-- Triage assessments per close session: risk score, materiality threshold, top drivers.
-- One row per assessment run (latest used for session triage).

CREATE TABLE IF NOT EXISTS triage_assessments (
  id TEXT PRIMARY KEY,
  close_session_id TEXT NOT NULL,
  risk_score INTEGER NOT NULL,
  materiality_threshold NUMERIC NOT NULL,
  basis_used TEXT NOT NULL,
  summary_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_risk_score CHECK (risk_score >= 0 AND risk_score <= 100)
);

CREATE INDEX IF NOT EXISTS idx_triage_assessments_close_session ON triage_assessments(close_session_id);
