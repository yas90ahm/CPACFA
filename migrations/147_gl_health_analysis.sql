-- GL Health Analysis: stores results of automated GL quality checks per close session.
CREATE TABLE IF NOT EXISTS core.gl_health_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  close_session_id UUID NOT NULL,
  period_label TEXT NOT NULL,
  overall_grade VARCHAR(1) NOT NULL,
  overall_score NUMERIC(5,1) NOT NULL,
  checks JSONB NOT NULL,
  finding_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, close_session_id)
);
CREATE INDEX IF NOT EXISTS idx_gl_health_tenant_session
  ON core.gl_health_analysis(tenant_id, close_session_id);
