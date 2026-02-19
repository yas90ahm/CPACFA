-- Cascade: when TB changes, statements become stale.
-- Set statements_stale_since when cascade invalidates statements.
-- Clear when statements are regenerated.
ALTER TABLE close_sessions ADD COLUMN IF NOT EXISTS statements_stale_since TIMESTAMPTZ;
