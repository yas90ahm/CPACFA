-- Close session: link to ledger snapshot created at certification (source of truth for binder/export).

ALTER TABLE close_sessions
  ADD COLUMN IF NOT EXISTS certified_snapshot_id TEXT;

-- Optional FK: snapshot must exist when set (ledger_snapshots may be in same schema or public)
-- CREATE INDEX for lookups when resolving binder by session
CREATE INDEX IF NOT EXISTS idx_close_sessions_certified_snapshot ON close_sessions(certified_snapshot_id) WHERE certified_snapshot_id IS NOT NULL;
