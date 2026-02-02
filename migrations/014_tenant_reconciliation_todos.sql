-- Reconciliation todos per tenant (gap-derived actionable tasks).

CREATE TABLE IF NOT EXISTS reconciliation_todos (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  gap_id TEXT NOT NULL,
  title TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  urgency TEXT NOT NULL DEFAULT 'medium',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_todos_tenant ON reconciliation_todos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_todos_tenant_gap ON reconciliation_todos(tenant_id, gap_id);
