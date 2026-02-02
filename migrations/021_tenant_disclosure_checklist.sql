-- Disclosure checklist per tenant (required disclosures by standard).

CREATE TABLE IF NOT EXISTS disclosure_checklist (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  period_label TEXT NOT NULL,
  standard TEXT NOT NULL,
  topic TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'not_started',
  evidence_id TEXT,
  evidence_type TEXT,
  assignee TEXT,
  due_date TEXT
);

CREATE INDEX IF NOT EXISTS idx_disclosure_checklist_tenant ON disclosure_checklist(tenant_id);
CREATE INDEX IF NOT EXISTS idx_disclosure_checklist_period ON disclosure_checklist(tenant_id, period_label);
CREATE INDEX IF NOT EXISTS idx_disclosure_checklist_standard ON disclosure_checklist(tenant_id, period_label, standard);
