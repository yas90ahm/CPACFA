-- Tenant-level financial configuration overrides (materiality, etc.).
-- Used when no tenant-specific config exists: fall back to shared/config/financial_rules.json.

CREATE TABLE IF NOT EXISTS tenant_financial_config (
  tenant_id TEXT NOT NULL,
  config_key TEXT NOT NULL,
  config_value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, config_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_financial_config_tenant ON tenant_financial_config(tenant_id);
