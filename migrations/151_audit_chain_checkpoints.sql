-- Migration 151: Audit chain verification checkpoints
-- Stores the last verified position per tenant to enable incremental chain verification.
-- Full chain verification remains available via verifyFullChain().

CREATE TABLE IF NOT EXISTS audit_chain_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  last_verified_entry_id UUID NOT NULL,
  last_verified_hash TEXT NOT NULL,
  entries_verified INTEGER NOT NULL,
  verified_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id)
);
