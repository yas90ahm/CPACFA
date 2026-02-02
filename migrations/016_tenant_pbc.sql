-- PBC (Provided by Client) items per tenant (FW3).

CREATE TABLE IF NOT EXISTS pbc_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMPTZ,
  provided_at TIMESTAMPTZ,
  document_id TEXT,
  period_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pbc_items_tenant ON pbc_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pbc_items_tenant_status ON pbc_items(tenant_id, status);
