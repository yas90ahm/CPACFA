-- GAP I10: Reconciling item carry-forward support.
-- Adds columns to tenant_recon_items for tracking carry-forward provenance and resolution.

ALTER TABLE tenant_recon_items
  ADD COLUMN IF NOT EXISTS carried_from_period TEXT,
  ADD COLUMN IF NOT EXISTS original_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- Index for finding unresolved items efficiently
CREATE INDEX IF NOT EXISTS idx_recon_items_unresolved
  ON tenant_recon_items(recon_id) WHERE resolved_at IS NULL;

-- Index for carry-forward provenance lookups
CREATE INDEX IF NOT EXISTS idx_recon_items_carried_from
  ON tenant_recon_items(carried_from_period) WHERE carried_from_period IS NOT NULL;
