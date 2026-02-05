-- Decision records: append-only "why" for automated/assisted decisions (explainability for auditors).

CREATE TABLE IF NOT EXISTS decision_records (
  id TEXT PRIMARY KEY,
  close_session_id TEXT,
  tenant_id TEXT NOT NULL,
  decision_type TEXT NOT NULL,
  subject_ref JSONB NOT NULL DEFAULT '{}',
  input_hash TEXT,
  input_snapshot JSONB,
  output_snapshot JSONB,
  confidence_score NUMERIC,
  rationale_text TEXT,
  engine_version TEXT,
  prompt_snapshot TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_decision_type CHECK (decision_type IN (
    'classification', 'coa_mapping', 'recon_match', 'je_suggestion', 'anomaly_flag'
  )),
  CONSTRAINT chk_confidence_score CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1))
);

CREATE INDEX IF NOT EXISTS idx_decision_records_tenant ON decision_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_decision_records_close_session ON decision_records(close_session_id) WHERE close_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_decision_records_type ON decision_records(tenant_id, decision_type);
CREATE INDEX IF NOT EXISTS idx_decision_records_created ON decision_records(tenant_id, created_at DESC);
