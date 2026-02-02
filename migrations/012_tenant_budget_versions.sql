-- Budget versions and lines — tenant schema.

CREATE TABLE IF NOT EXISTS budget_versions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  period_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT
);

CREATE TABLE IF NOT EXISTS budget_version_lines (
  id TEXT PRIMARY KEY,
  budget_version_id TEXT NOT NULL REFERENCES budget_versions(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  category TEXT,
  driver_ref TEXT
);

CREATE INDEX IF NOT EXISTS idx_budget_versions_tenant ON budget_versions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_budget_versions_period ON budget_versions(tenant_id, period_label);
CREATE INDEX IF NOT EXISTS idx_budget_version_lines_version ON budget_version_lines(budget_version_id);
