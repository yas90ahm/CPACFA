-- Entity general settings: fiscal year, currency, auto-lock, variance materiality thresholds.

CREATE TABLE IF NOT EXISTS tenant_entity_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_name VARCHAR(255) NOT NULL DEFAULT '',
  fiscal_year_end_month INTEGER NOT NULL DEFAULT 12
    CHECK (fiscal_year_end_month BETWEEN 1 AND 12),
  base_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  auto_lock_days INTEGER NOT NULL DEFAULT 0
    CHECK (auto_lock_days >= 0),
  variance_materiality_dollar NUMERIC(20,2) NOT NULL DEFAULT 10000.00,
  variance_materiality_percent NUMERIC(10,4) NOT NULL DEFAULT 10.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_entity_settings_tenant ON tenant_entity_settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_entity_settings_entity ON tenant_entity_settings(tenant_id, entity_id);
