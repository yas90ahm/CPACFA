-- Enforce non-empty memo on journal entries.
-- First backfill any null/empty memos, then add constraint.
UPDATE journal_entries
SET memo = COALESCE(NULLIF(TRIM(memo), ''), '(no memo)')
WHERE memo IS NULL OR LENGTH(TRIM(memo)) = 0;

ALTER TABLE journal_entries
  DROP CONSTRAINT IF EXISTS je_memo_required;

ALTER TABLE journal_entries
  ADD CONSTRAINT je_memo_required
  CHECK (memo IS NOT NULL AND LENGTH(TRIM(memo)) > 0);
