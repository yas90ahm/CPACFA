-- Evidence Anchoring Phase 2A: extend evidence_links with assertion discipline.

ALTER TABLE evidence_links ADD COLUMN IF NOT EXISTS assertion_type TEXT;
ALTER TABLE evidence_links ADD COLUMN IF NOT EXISTS claimed_amount TEXT;
ALTER TABLE evidence_links ADD COLUMN IF NOT EXISTS claimed_currency TEXT;
ALTER TABLE evidence_links ADD COLUMN IF NOT EXISTS claimed_period TEXT;
ALTER TABLE evidence_links ADD COLUMN IF NOT EXISTS note TEXT;

-- Backfill assertion_type for existing rows (required for new inserts; existing can stay null until updated)
-- New inserts will require assertion_type. Constraint added after backfill if needed.
-- For now we allow NULL for backward compat; application enforces required for new links.
