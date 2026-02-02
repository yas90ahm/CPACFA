-- Latest statement generation per tenant (for audit binder, catalog, reconciliation summary).
-- One row per tenant; upsert on register.

CREATE TABLE IF NOT EXISTS statement_generations (
  tenant_id TEXT PRIMARY KEY,
  source_document_id TEXT NOT NULL,
  source_document_name TEXT NOT NULL,
  reasoning_chain_id TEXT NOT NULL,
  reasoning_chain_timestamp TEXT NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  statements JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_statement_generations_tenant ON statement_generations(tenant_id);
