-- Migration 215: Add NOT NULL + CHECK constraint on amount_provenance
-- Ensures every journal_entry_line with a non-zero amount has provenance metadata.

-- Step 1: Backfill NULL provenance on existing lines with non-zero amounts
UPDATE journal_entry_lines
SET amount_provenance = '{"kind": "human_entered", "source": "legacy_migration"}'::jsonb
WHERE amount_provenance IS NULL AND (debit > 0 OR credit > 0);

-- Step 2: Add CHECK constraint — provenance required when amount is non-zero
ALTER TABLE journal_entry_lines
ADD CONSTRAINT chk_amount_provenance_required
CHECK (
  (debit = 0 AND credit = 0) OR amount_provenance IS NOT NULL
);
