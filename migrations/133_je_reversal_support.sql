-- Migration 133: Add reversal tracking columns to journal_entries
-- Supports M-01 (reverse posted JE) and N-04 (auto-reversal batch).

-- reversed_by_je_id: points to the JE that reverses THIS entry
-- reverses_je_id:    points to the original JE that THIS entry reverses
-- These form a bidirectional link between original and reversal entries.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'journal_entries' AND column_name = 'reversed_by_je_id'
  ) THEN
    ALTER TABLE journal_entries ADD COLUMN reversed_by_je_id TEXT DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'journal_entries' AND column_name = 'reverses_je_id'
  ) THEN
    ALTER TABLE journal_entries ADD COLUMN reverses_je_id TEXT DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'journal_entries' AND column_name = 'is_reversal'
  ) THEN
    ALTER TABLE journal_entries ADD COLUMN is_reversal BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_je_reverses ON journal_entries (reverses_je_id) WHERE reverses_je_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_je_reversed_by ON journal_entries (reversed_by_je_id) WHERE reversed_by_je_id IS NOT NULL;
