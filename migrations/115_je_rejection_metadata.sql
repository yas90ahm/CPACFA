-- JE rejection metadata: reason, rejected_by, rejected_at.

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS rejected_by TEXT,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
