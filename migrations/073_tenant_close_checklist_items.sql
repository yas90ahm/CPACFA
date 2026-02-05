-- Close checklist items per close_session: required controls (cash rec, no critical issues, material JEs approved, integrity).
-- Used for readiness gating; export/finalize enforce hard blockers.

CREATE TABLE IF NOT EXISTS close_checklist_items (
  id TEXT PRIMARY KEY,
  close_session_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  required BOOLEAN NOT NULL DEFAULT true,
  completed_by TEXT,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_checklist_item_status CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped'))
);

CREATE INDEX IF NOT EXISTS idx_close_checklist_items_session ON close_checklist_items(close_session_id);
CREATE INDEX IF NOT EXISTS idx_close_checklist_items_code ON close_checklist_items(close_session_id, code);
