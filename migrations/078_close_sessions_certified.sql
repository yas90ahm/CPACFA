-- Close session certification: certified_by, certified_at, certification_memo; status 'certified'.

ALTER TABLE close_sessions
  ADD COLUMN IF NOT EXISTS certified_by TEXT,
  ADD COLUMN IF NOT EXISTS certified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS certification_memo TEXT;

-- Allow status 'certified' (drop and re-add check constraint).
ALTER TABLE close_sessions DROP CONSTRAINT IF EXISTS chk_status;
ALTER TABLE close_sessions ADD CONSTRAINT chk_status
  CHECK (status IN ('draft','in_progress','ready_for_review','finalized','locked','certified'));
