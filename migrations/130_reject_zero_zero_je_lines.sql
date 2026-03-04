-- Migration 130: Reject JE lines where both debit and credit are zero.
-- A zero-zero line has no financial effect and should not exist in the ledger.
-- We only clean up lines on non-posted (draft/rejected) JEs to respect immutability.

-- Remove zero-zero lines from draft/rejected JEs only (posted lines are immutable)
DELETE FROM journal_entry_lines
WHERE debit = 0 AND credit = 0
  AND je_id IN (
    SELECT id FROM journal_entries WHERE status IN ('draft', 'rejected')
  );

-- Add CHECK constraint with NOT VALID to avoid scanning existing posted rows.
-- New inserts will be validated; existing rows are grandfathered.
ALTER TABLE journal_entry_lines
  DROP CONSTRAINT IF EXISTS chk_no_zero_zero_line;
ALTER TABLE journal_entry_lines
  ADD CONSTRAINT chk_no_zero_zero_line
  CHECK (debit > 0 OR credit > 0)
  NOT VALID;
