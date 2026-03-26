-- AI Revenue Recognition Suggestions (HITL staging)
-- AI-generated allocation and schedule suggestions must be accepted by a human
-- before reaching core revenue tables. This table is the staging area.

CREATE TABLE IF NOT EXISTS ai_revenue_suggestions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  contract_id TEXT NOT NULL,
  suggestion_type TEXT NOT NULL CHECK (suggestion_type IN ('allocation', 'schedule')),
  suggested_values JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_rev_sugg_tenant ON ai_revenue_suggestions (tenant_id, contract_id);
CREATE INDEX IF NOT EXISTS idx_ai_rev_sugg_status ON ai_revenue_suggestions (tenant_id, status);
