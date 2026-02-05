-- Reconciliation state machine: runs, items, match groups, exceptions, signoffs (tied to close_session_id).

CREATE TABLE IF NOT EXISTS recon_runs (
  id TEXT PRIMARY KEY,
  close_session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'draft',
  CONSTRAINT chk_recon_run_type CHECK (type IN ('bank', 'ar', 'ap', 'interco')),
  CONSTRAINT chk_recon_run_status CHECK (status IN ('draft', 'in_progress', 'ready_for_review', 'signed_off'))
);

CREATE INDEX IF NOT EXISTS idx_recon_runs_close_session ON recon_runs(close_session_id);
CREATE INDEX IF NOT EXISTS idx_recon_runs_type ON recon_runs(close_session_id, type);

CREATE TABLE IF NOT EXISTS recon_items (
  id TEXT PRIMARY KEY,
  recon_run_id TEXT NOT NULL,
  source TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  item_date DATE,
  description TEXT,
  ref JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_recon_item_source CHECK (source IN ('bank', 'gl', 'subledger'))
);

CREATE INDEX IF NOT EXISTS idx_recon_items_run ON recon_items(recon_run_id);

CREATE TABLE IF NOT EXISTS recon_match_groups (
  id TEXT PRIMARY KEY,
  recon_run_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed',
  match_confidence NUMERIC,
  decision_record_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_match_group_status CHECK (status IN ('proposed', 'confirmed', 'rejected')),
  CONSTRAINT chk_match_confidence CHECK (match_confidence IS NULL OR (match_confidence >= 0 AND match_confidence <= 1))
);

CREATE INDEX IF NOT EXISTS idx_recon_match_groups_run ON recon_match_groups(recon_run_id);

CREATE TABLE IF NOT EXISTS recon_match_group_items (
  match_group_id TEXT NOT NULL,
  recon_item_id TEXT NOT NULL,
  PRIMARY KEY (match_group_id, recon_item_id),
  CONSTRAINT fk_match_group FOREIGN KEY (match_group_id) REFERENCES recon_match_groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_recon_item FOREIGN KEY (recon_item_id) REFERENCES recon_items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS recon_exceptions (
  id TEXT PRIMARY KEY,
  recon_run_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  linked_issue_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_recon_exception_status CHECK (status IN ('open', 'resolved', 'wont_fix'))
);

CREATE INDEX IF NOT EXISTS idx_recon_exceptions_run ON recon_exceptions(recon_run_id);

CREATE TABLE IF NOT EXISTS recon_signoffs (
  recon_run_id TEXT PRIMARY KEY,
  signed_by TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT
);
