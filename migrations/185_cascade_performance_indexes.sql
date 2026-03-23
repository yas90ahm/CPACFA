-- Performance indexes for cascade engine (Bug 3 fix)
-- tenant_period_reconciliations needs composite (tenant_id, period_id) for batch GL refresh
CREATE INDEX IF NOT EXISTS idx_period_recons_tenant_period
  ON tenant_period_reconciliations(tenant_id, period_id);

-- period_trial_balance composite for close session lookups
CREATE INDEX IF NOT EXISTS idx_period_trial_balance_session
  ON period_trial_balance(tenant_id, close_session_id);
