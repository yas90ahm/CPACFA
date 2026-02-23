-- Close session state machine realignment (Step 3).
-- Target: OPEN → IN_PROGRESS → UNDER_REVIEW → CERTIFIED → LOCKED
-- Old:    draft → in_progress → ready_for_review → finalized → locked → certified
--
-- Mapping:
--   draft            → open
--   in_progress      → in_progress
--   ready_for_review → under_review
--   finalized        → under_review (merge: no separate "finalized" in target)
--   locked           → under_review (old flow locked before certify; these need to be certified in new flow)
--   certified        → locked (old "certified" = fully done = new terminal "locked")
--
-- Add columns for reopen workflow (CERTIFIED → IN_PROGRESS).
ALTER TABLE close_sessions
  ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reopened_by TEXT,
  ADD COLUMN IF NOT EXISTS reopen_reason TEXT;

-- Drop old status constraint before mapping (so UPDATE to 'open' etc. is allowed).
ALTER TABLE close_sessions DROP CONSTRAINT IF EXISTS chk_status;

-- Map existing data to new status values.
UPDATE close_sessions SET status = 'open'            WHERE status = 'draft';
UPDATE close_sessions SET status = 'under_review'   WHERE status IN ('ready_for_review', 'finalized', 'locked');
UPDATE close_sessions SET status = 'locked'         WHERE status = 'certified';
-- in_progress stays in_progress (no change)

-- Add new status constraint.
ALTER TABLE close_sessions ADD CONSTRAINT chk_status
  CHECK (status IN ('open', 'in_progress', 'under_review', 'certified', 'locked'));

-- Default for new rows: open
ALTER TABLE close_sessions ALTER COLUMN status SET DEFAULT 'open';

-- DOWN (reversible): restore old enum and map back (for rollback only).
-- UPDATE close_sessions SET status = 'draft'   WHERE status = 'open';
-- UPDATE close_sessions SET status = 'ready_for_review' WHERE status = 'under_review' AND (certified_by IS NULL OR certified_at IS NULL);
-- UPDATE close_sessions SET status = 'finalized' WHERE status = 'under_review' AND certified_by IS NOT NULL;
-- UPDATE close_sessions SET status = 'locked'   WHERE status = 'under_review';  -- ambiguous; prefer under_review→locked for old "locked"
-- UPDATE close_sessions SET status = 'certified' WHERE status = 'locked';
-- ALTER TABLE close_sessions DROP CONSTRAINT IF EXISTS chk_status;
-- ALTER TABLE close_sessions ADD CONSTRAINT chk_status CHECK (status IN ('draft','in_progress','ready_for_review','finalized','locked','certified'));
