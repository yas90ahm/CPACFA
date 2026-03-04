-- Migration 136: Add prior period reference columns to tenant_period_reconciliations
-- Enables carry-forward of reconciliation data from prior certified sessions.

ALTER TABLE tenant_period_reconciliations
  ADD COLUMN IF NOT EXISTS prior_period_session_id UUID,
  ADD COLUMN IF NOT EXISTS prior_period_gl_balance NUMERIC(20,2),
  ADD COLUMN IF NOT EXISTS prior_period_supporting_balance NUMERIC(20,2),
  ADD COLUMN IF NOT EXISTS copied_from_prior BOOLEAN DEFAULT FALSE;
