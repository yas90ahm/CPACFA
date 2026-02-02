-- Close checklist templates per tenant: default steps per period type (monthly, quarterly, annual).

CREATE TABLE IF NOT EXISTS close_checklist_templates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Default',
  steps_spec JSONB NOT NULL DEFAULT '[]',
  period_type TEXT NOT NULL DEFAULT 'monthly',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, period_type)
);

CREATE INDEX IF NOT EXISTS idx_close_checklist_templates_tenant ON close_checklist_templates(tenant_id);
