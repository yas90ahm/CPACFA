-- Enforce non-empty memo on journal entries.
-- First backfill any null/empty memos, then add constraint.
-- Temporarily disable immutability triggers so we can backfill posted entries.
ALTER TABLE journal_entries DISABLE TRIGGER je_immutable_after_post;
ALTER TABLE journal_entries DISABLE TRIGGER je_no_delete_after_post;

UPDATE journal_entries
SET memo = COALESCE(NULLIF(TRIM(memo), ''), '(no memo)')
WHERE memo IS NULL OR LENGTH(TRIM(memo)) = 0;

ALTER TABLE journal_entries ENABLE TRIGGER je_immutable_after_post;
ALTER TABLE journal_entries ENABLE TRIGGER je_no_delete_after_post;

ALTER TABLE journal_entries
  DROP CONSTRAINT IF EXISTS je_memo_required;

ALTER TABLE journal_entries
  ADD CONSTRAINT je_memo_required
  CHECK (memo IS NOT NULL AND LENGTH(TRIM(memo)) > 0);
