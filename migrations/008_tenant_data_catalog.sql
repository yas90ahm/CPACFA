-- Custom data catalog entries (tenant schema). Default catalog is in code; this stores tenant overrides/custom datasets.

CREATE TABLE IF NOT EXISTS data_catalog (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  schema JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_data_catalog_tenant ON data_catalog(tenant_id);
