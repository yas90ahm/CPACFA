-- AJE templates for recurring entries. Amounts are defaults; user can override when applying.

CREATE TABLE IF NOT EXISTS tenant_aje_templates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  entity_id TEXT,
  name TEXT NOT NULL,
  memo TEXT NOT NULL,
  lines JSONB NOT NULL DEFAULT '[]',
  frequency TEXT NOT NULL DEFAULT 'monthly',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_aje_template_frequency CHECK (frequency IN ('monthly', 'quarterly', 'annually'))
);

CREATE INDEX IF NOT EXISTS idx_aje_templates_tenant ON tenant_aje_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_aje_templates_tenant_entity ON tenant_aje_templates(tenant_id, entity_id);
CREATE INDEX IF NOT EXISTS idx_aje_templates_active ON tenant_aje_templates(tenant_id, is_active) WHERE is_active = true;

-- Applications: which templates were proposed/applied/skipped for a given close session.
CREATE TABLE IF NOT EXISTS tenant_aje_template_applications (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  template_id TEXT NOT NULL REFERENCES tenant_aje_templates(id) ON DELETE CASCADE,
  close_session_id TEXT NOT NULL REFERENCES close_sessions(id) ON DELETE CASCADE,
  period_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed',
  applied_je_id TEXT,
  skipped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_aje_app_status CHECK (status IN ('proposed', 'applied', 'skipped')),
  UNIQUE (tenant_id, template_id, close_session_id)
);

CREATE INDEX IF NOT EXISTS idx_aje_apps_tenant ON tenant_aje_template_applications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_aje_apps_close_session ON tenant_aje_template_applications(close_session_id);
