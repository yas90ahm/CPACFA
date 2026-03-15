-- Renumbered from 066 to 166 to resolve duplicate prefix
-- Subledger / bank statement source data for reconciliation matching.
-- One row per uploaded source file per reconciliation per close session.

CREATE TABLE IF NOT EXISTS tenant_recon_source_data (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  recon_id TEXT NOT NULL,
  close_session_id TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'bank_statement',
  file_name TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by TEXT,
  entries JSONB NOT NULL DEFAULT '[]',
  total_amount NUMERIC(20, 2),
  entry_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_recon_source_tenant ON tenant_recon_source_data(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recon_source_recon ON tenant_recon_source_data(tenant_id, recon_id);
CREATE INDEX IF NOT EXISTS idx_recon_source_session ON tenant_recon_source_data(tenant_id, close_session_id);
