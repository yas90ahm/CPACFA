-- Filing calendar and tax returns (tenant schema).

CREATE TABLE IF NOT EXISTS filing_calendar_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  due_date DATE NOT NULL,
  entity_id TEXT,
  jurisdiction TEXT,
  status TEXT,
  recurrence TEXT,
  reminder_days INTEGER
);

CREATE INDEX IF NOT EXISTS idx_filing_calendar_tenant ON filing_calendar_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_filing_calendar_due ON filing_calendar_items(tenant_id, due_date);

CREATE TABLE IF NOT EXISTS tax_returns (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  period_label TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  due_date DATE NOT NULL,
  filed_at TIMESTAMPTZ,
  provision_snapshot JSONB,
  prior_year_figures JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tax_returns_tenant ON tax_returns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tax_returns_entity ON tax_returns(tenant_id, entity_id);
CREATE INDEX IF NOT EXISTS idx_tax_returns_due ON tax_returns(tenant_id, due_date);
