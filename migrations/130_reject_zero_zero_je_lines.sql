-- Migration 130: Reject JE lines where both debit and credit are zero.
-- A zero-zero line has no financial effect and should not exist in the ledger.
-- Existing zero-zero lines (if any) are cleaned up first.

-- Remove any existing zero-zero lines (should not exist in production)
DELETE FROM journal_entry_lines
WHERE debit = 0 AND credit = 0;

-- Add CHECK constraint to prevent future zero-zero lines
ALTER TABLE journal_entry_lines
  ADD CONSTRAINT chk_no_zero_zero_line
  CHECK (debit > 0 OR credit > 0);
