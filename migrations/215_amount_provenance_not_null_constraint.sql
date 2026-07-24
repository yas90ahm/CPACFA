-- Migration 215: Add NOT NULL + CHECK constraint on amount_provenance
-- Ensures every journal_entry_line with a non-zero amount has provenance metadata.

-- Step 1: Backfill NULL provenance on existing lines with non-zero amounts
UPDATE journal_entry_lines
SET amount_provenance = '{"kind": "human_entered", "source": "legacy_migration"}'::jsonb
WHERE amount_provenance IS NULL AND (debit > 0 OR credit > 0);

-- Step 2: Add CHECK constraint — provenance required when amount is non-zero.
-- Some databases applied the constraint before migration bookkeeping was fixed,
-- so guard the DDL as well as the migration version.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_amount_provenance_required'
      AND conrelid = 'journal_entry_lines'::regclass
  ) THEN
    ALTER TABLE journal_entry_lines
    ADD CONSTRAINT chk_amount_provenance_required
    CHECK (
      (debit = 0 AND credit = 0) OR amount_provenance IS NOT NULL
    );
  END IF;
END $$;
