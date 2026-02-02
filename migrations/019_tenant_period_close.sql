-- Period close record per tenant (status, sign-off).

CREATE TABLE IF NOT EXISTS period_close (
  tenant_id TEXT NOT NULL,
  period_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  closed_at TIMESTAMPTZ,
  closed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, period_label)
);

CREATE INDEX IF NOT EXISTS idx_period_close_tenant ON period_close(tenant_id);
