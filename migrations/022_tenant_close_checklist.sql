-- Close checklist per tenant (steps JSONB, one row per period).

CREATE TABLE IF NOT EXISTS close_checklist (
  tenant_id TEXT NOT NULL,
  period_label TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, period_label)
);

CREATE INDEX IF NOT EXISTS idx_close_checklist_tenant ON close_checklist(tenant_id);
CREATE INDEX IF NOT EXISTS idx_close_checklist_period ON close_checklist(tenant_id, period_label);
