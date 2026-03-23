-- Gap 6: ASC 855 Subsequent Events Review — new state between CERTIFIED and LOCKED

-- 1. Update status CHECK constraint to include new state
ALTER TABLE close_sessions DROP CONSTRAINT IF EXISTS chk_close_session_status;
ALTER TABLE close_sessions ADD CONSTRAINT chk_close_session_status
  CHECK (status IN ('open','in_progress','under_review','certified',
                    'subsequent_events_review','locked'));

-- 2. Columns for explicit "no subsequent events" confirmation
ALTER TABLE close_sessions
  ADD COLUMN IF NOT EXISTS subsequent_events_confirmed_by TEXT,
  ADD COLUMN IF NOT EXISTS subsequent_events_confirmed_at TIMESTAMPTZ;

-- 3. Subsequent events table
CREATE TABLE IF NOT EXISTS subsequent_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  close_session_id TEXT NOT NULL REFERENCES close_sessions(id),
  event_date DATE NOT NULL,
  description TEXT NOT NULL,
  impact_assessment TEXT,
  disposition TEXT CHECK (disposition IS NULL OR disposition IN (
    'no_impact','requires_adjustment','requires_disclosure'
  )),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subsequent_events_session
  ON subsequent_events(tenant_id, close_session_id);
