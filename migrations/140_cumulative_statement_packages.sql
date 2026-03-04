-- Support cumulative (QTD/YTD) statement packages
ALTER TABLE statement_packages
  ADD COLUMN IF NOT EXISTS package_type TEXT NOT NULL DEFAULT 'standard'
    CHECK (package_type IN ('standard', 'cumulative')),
  ADD COLUMN IF NOT EXISTS cumulative_period TEXT DEFAULT NULL
    CHECK (cumulative_period IS NULL OR cumulative_period IN ('QTD', 'YTD')),
  ADD COLUMN IF NOT EXISTS cumulative_note TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS included_session_ids TEXT[] DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_statement_packages_cumulative
  ON statement_packages (close_session_id, package_type)
  WHERE package_type = 'cumulative';
