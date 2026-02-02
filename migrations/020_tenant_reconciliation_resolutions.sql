-- Reconciliation resolutions per tenant (rec passed/failed, status, waiver).

CREATE TABLE IF NOT EXISTS reconciliation_resolutions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  period_label TEXT NOT NULL,
  reconciliation_type TEXT NOT NULL,
  passed BOOLEAN NOT NULL,
  message TEXT,
  detail TEXT,
  assignee TEXT,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  waived_at TIMESTAMPTZ,
  waived_by TEXT,
  waived_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_rec_resolutions_tenant ON reconciliation_resolutions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rec_resolutions_period ON reconciliation_resolutions(tenant_id, period_label);
CREATE INDEX IF NOT EXISTS idx_rec_resolutions_type ON reconciliation_resolutions(tenant_id, period_label, reconciliation_type);
