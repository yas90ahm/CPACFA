-- Performance indexes for cascade engine hot paths.
-- Composite indexes for the most frequent cascade query patterns.

-- Period reconciliations: cascade refreshGLBalances queries by (tenant_id, period_id)
CREATE INDEX IF NOT EXISTS idx_period_recons_tenant_period
  ON tenant_period_reconciliations(tenant_id, period_id);

-- Journal entries: readiness check queries by (tenant_id, close_session_id)
CREATE INDEX IF NOT EXISTS idx_journal_entries_tenant_session
  ON journal_entries(tenant_id, close_session_id);

-- Close issues: blocking issues query by (tenant_id, period_id, status)
CREATE INDEX IF NOT EXISTS idx_close_issues_tenant_period_status
  ON tenant_close_issues(tenant_id, period_id, status);

-- Recon requirements: listRequirements queries by (tenant_id, entity_id)
CREATE INDEX IF NOT EXISTS idx_recon_requirements_tenant_entity
  ON tenant_recon_requirements(tenant_id, entity_id);
