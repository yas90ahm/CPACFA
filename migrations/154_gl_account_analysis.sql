-- GL Account Analysis: stores per-account quality flags from the Account Intelligence Service.
-- Persists deterministic + AI analysis results for each close session.
CREATE TABLE IF NOT EXISTS core.gl_account_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  close_session_id UUID NOT NULL,
  account_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  balance_debit NUMERIC(20,2) DEFAULT 0,
  balance_credit NUMERIC(20,2) DEFAULT 0,
  balance_net NUMERIC(20,2) DEFAULT 0,
  flags JSONB NOT NULL DEFAULT '[]',
  clean_name TEXT,
  duplicate_of TEXT,
  suggested_contra_of TEXT,
  suggested_action TEXT,
  action_taken TEXT CHECK (action_taken IN ('excluded', 'kept', 'merged', 'reclassified')),
  action_taken_by TEXT,
  action_taken_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, close_session_id, account_code)
);

CREATE INDEX IF NOT EXISTS idx_gl_acct_analysis_session
  ON core.gl_account_analysis (tenant_id, close_session_id);
CREATE INDEX IF NOT EXISTS idx_gl_acct_analysis_action
  ON core.gl_account_analysis (action_taken) WHERE action_taken IS NOT NULL;
