-- Versioned statement packages: every generation persists version, input hash, outputs, and diff vs previous.
-- Deterministic: same approved data => same output; store classifier/mapping rule versions for traceability.

CREATE TABLE IF NOT EXISTS statement_packages (
  id TEXT PRIMARY KEY,
  close_session_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  input_hash TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  engine_version TEXT,
  rule_versions_snapshot JSONB,
  CONSTRAINT chk_statement_package_status CHECK (status IN ('draft', 'final'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_statement_packages_session_version ON statement_packages(close_session_id, version);
CREATE INDEX IF NOT EXISTS idx_statement_packages_session ON statement_packages(close_session_id);
CREATE INDEX IF NOT EXISTS idx_statement_packages_generated_at ON statement_packages(close_session_id, generated_at DESC);

CREATE TABLE IF NOT EXISTS statement_lines (
  package_id TEXT NOT NULL,
  fs_line_id TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  statement TEXT NOT NULL,
  metadata JSONB,
  PRIMARY KEY (package_id, fs_line_id),
  CONSTRAINT fk_statement_lines_package FOREIGN KEY (package_id) REFERENCES statement_packages(id) ON DELETE CASCADE,
  CONSTRAINT chk_statement_lines_statement CHECK (statement IN ('balance_sheet', 'profit_and_loss'))
);

CREATE INDEX IF NOT EXISTS idx_statement_lines_package ON statement_lines(package_id);

CREATE TABLE IF NOT EXISTS statement_diffs (
  from_package_id TEXT NOT NULL,
  to_package_id TEXT NOT NULL,
  diff_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (from_package_id, to_package_id),
  CONSTRAINT fk_statement_diffs_from FOREIGN KEY (from_package_id) REFERENCES statement_packages(id) ON DELETE CASCADE,
  CONSTRAINT fk_statement_diffs_to FOREIGN KEY (to_package_id) REFERENCES statement_packages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_statement_diffs_to ON statement_diffs(to_package_id);
