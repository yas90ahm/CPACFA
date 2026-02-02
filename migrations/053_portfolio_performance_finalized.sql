-- GIPS: Portfolio performance finalization and corrections.
-- Once a period is finalized, historical performance is immutable; changes are append-only corrections with hash chain.

-- Deduplicate: keep one row per (tenant_id, portfolio_id, period_label), latest by created_at
DELETE FROM portfolio_performance a
USING portfolio_performance b
WHERE a.tenant_id = b.tenant_id AND a.portfolio_id = b.portfolio_id AND a.period_label = b.period_label
  AND a.created_at < b.created_at;

-- Add status and finalization metadata to portfolio_performance
ALTER TABLE portfolio_performance
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finalized_by TEXT;

ALTER TABLE portfolio_performance DROP CONSTRAINT IF EXISTS uq_portfolio_performance_tenant_portfolio_period;
ALTER TABLE portfolio_performance
  ADD CONSTRAINT uq_portfolio_performance_tenant_portfolio_period UNIQUE (tenant_id, portfolio_id, period_label);

-- Append-only corrections table (hash-chained)
CREATE TABLE IF NOT EXISTS portfolio_performance_corrections (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  portfolio_id TEXT NOT NULL,
  period_label TEXT NOT NULL,
  original_performance_id TEXT NOT NULL REFERENCES portfolio_performance(id),
  correction_snapshot JSONB NOT NULL DEFAULT '{}',
  reason TEXT NOT NULL,
  previous_entry_hash TEXT,
  entry_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_portfolio_performance_corrections_tenant ON portfolio_performance_corrections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_performance_corrections_original ON portfolio_performance_corrections(original_performance_id);
