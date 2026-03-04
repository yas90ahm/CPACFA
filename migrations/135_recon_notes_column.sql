-- Migration 135: Add notes column to tenant_period_reconciliations
-- Notes were previously only saved to audit log and never loaded back.

ALTER TABLE tenant_period_reconciliations ADD COLUMN IF NOT EXISTS notes TEXT;
