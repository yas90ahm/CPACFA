-- Policy memory per tenant/entity (and optional period) for standard, country, publiclyAccountable, etc.
-- Replaces in-memory-only storage so policy survives restart and is auditable.

CREATE TABLE IF NOT EXISTS tenant_policy_memory (
  tenant_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  period_label TEXT NOT NULL DEFAULT '',
  standard TEXT,
  country TEXT,
  jurisdiction TEXT,
  currency TEXT,
  tax_id TEXT,
  business_number TEXT,
  publicly_accountable BOOLEAN,
  overrides JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, entity_id, period_label)
);

CREATE INDEX IF NOT EXISTS idx_tenant_policy_memory_lookup
  ON tenant_policy_memory(tenant_id, entity_id);
