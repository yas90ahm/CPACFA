-- Variance analysis: period-over-period changes. change_amount and change_percentage are DB-generated.

CREATE TABLE IF NOT EXISTS tenant_variance_analysis (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  close_session_id TEXT NOT NULL REFERENCES close_sessions(id) ON DELETE CASCADE,
  period_label TEXT NOT NULL,
  fs_line_id TEXT NOT NULL,
  statement TEXT NOT NULL,
  label TEXT,
  current_amount DECIMAL(20, 4) NOT NULL DEFAULT 0,
  prior_amount DECIMAL(20, 4) NOT NULL DEFAULT 0,
  change_amount DECIMAL(20, 4) GENERATED ALWAYS AS (current_amount - prior_amount) STORED,
  change_percentage DECIMAL(12, 4) GENERATED ALWAYS AS (
    CASE WHEN prior_amount <> 0 THEN ((current_amount - prior_amount) / prior_amount) * 100 ELSE NULL END
  ) STORED,
  material_threshold_pct DECIMAL(8, 2) DEFAULT 5.00,
  explanation TEXT,
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, close_session_id, fs_line_id, statement)
);

CREATE INDEX IF NOT EXISTS idx_variance_tenant ON tenant_variance_analysis(tenant_id);
CREATE INDEX IF NOT EXISTS idx_variance_close_session ON tenant_variance_analysis(close_session_id);
CREATE INDEX IF NOT EXISTS idx_variance_unexplained ON tenant_variance_analysis(tenant_id, close_session_id)
  WHERE explanation IS NULL AND material_threshold_pct IS NOT NULL;
