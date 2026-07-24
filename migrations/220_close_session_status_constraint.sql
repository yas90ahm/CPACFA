-- Migration 182 introduced subsequent_events_review under a new constraint name,
-- leaving the older chk_status constraint in place. Replace both with one
-- canonical state-machine constraint.

ALTER TABLE close_sessions
  DROP CONSTRAINT IF EXISTS chk_status;

ALTER TABLE close_sessions
  DROP CONSTRAINT IF EXISTS chk_close_session_status;

ALTER TABLE close_sessions
  ADD CONSTRAINT chk_close_session_status
  CHECK (status IN (
    'open',
    'in_progress',
    'under_review',
    'certified',
    'subsequent_events_review',
    'locked'
  ));
