-- Migration 129: AI Classification Suggestion Tables
-- Stores COA mapping and Cash Flow classification suggestions from the SLM microservice.
-- AI writes ONLY to these ai_* tables — never to core financial tables.

BEGIN;

-- COA mapping suggestions (from SLM sentence-transformer + FAISS)
CREATE TABLE IF NOT EXISTS ai_coa_suggestions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  close_session_id TEXT NOT NULL REFERENCES close_sessions(id),
  account_code  TEXT,
  account_name  TEXT NOT NULL,
  suggested_fs_line_id TEXT NOT NULL,
  suggested_fs_line_label TEXT,
  confidence    NUMERIC(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  confidence_band TEXT NOT NULL CHECK (confidence_band IN ('high', 'medium', 'low')),
  tier          TEXT,
  alternatives  JSONB NOT NULL DEFAULT '[]',
  model_version TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
  reviewed_by   TEXT,
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_coa_suggestions_tenant_session
  ON ai_coa_suggestions(tenant_id, close_session_id);
CREATE INDEX idx_ai_coa_suggestions_status
  ON ai_coa_suggestions(tenant_id, status);

-- Cash Flow classification suggestions (from SLM DistilBERT)
CREATE TABLE IF NOT EXISTS ai_cf_suggestions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  close_session_id TEXT NOT NULL REFERENCES close_sessions(id),
  account_code  TEXT,
  account_name  TEXT NOT NULL,
  classification TEXT NOT NULL CHECK (classification IN ('Operating', 'Investing', 'Financing')),
  confidence    NUMERIC(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  confidence_band TEXT NOT NULL CHECK (confidence_band IN ('high', 'medium', 'low')),
  source        TEXT NOT NULL,
  rule_pattern  TEXT,
  alternatives  JSONB NOT NULL DEFAULT '[]',
  model_version TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
  reviewed_by   TEXT,
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_cf_suggestions_tenant_session
  ON ai_cf_suggestions(tenant_id, close_session_id);
CREATE INDEX idx_ai_cf_suggestions_status
  ON ai_cf_suggestions(tenant_id, status);

COMMIT;
