-- FS Line Taxonomy: standardized statement line items (PL/BS/CF).
-- Shared structure; tenant-scoped so tenants can extend.

CREATE TABLE IF NOT EXISTS fs_taxonomy_lines (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  statement TEXT NOT NULL,
  parent_id TEXT,
  normal_balance TEXT NOT NULL DEFAULT 'debit',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_statement CHECK (statement IN ('PL', 'BS', 'CF')),
  CONSTRAINT chk_normal_balance CHECK (normal_balance IN ('debit', 'credit'))
);

CREATE INDEX IF NOT EXISTS idx_fs_taxonomy_statement ON fs_taxonomy_lines(statement);
CREATE INDEX IF NOT EXISTS idx_fs_taxonomy_parent ON fs_taxonomy_lines(parent_id);

-- Seed default lines for fallback (accountType -> single line)
INSERT INTO fs_taxonomy_lines (id, code, name, statement, parent_id, normal_balance) VALUES
  ('fs_revenue', 'PL_REVENUE', 'Revenue', 'PL', NULL, 'credit'),
  ('fs_expense', 'PL_EXPENSE', 'Expenses', 'PL', NULL, 'debit'),
  ('fs_asset', 'BS_ASSET', 'Assets', 'BS', NULL, 'debit'),
  ('fs_liability', 'BS_LIABILITY', 'Liabilities', 'BS', NULL, 'credit'),
  ('fs_equity', 'BS_EQUITY', 'Equity', 'BS', NULL, 'credit')
ON CONFLICT (id) DO NOTHING;
