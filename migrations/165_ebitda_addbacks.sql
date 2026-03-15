-- Renumbered from 065 to 165 to resolve duplicate prefix
-- EBITDA addbacks: manual add-back items for EBITDA bridge computation.

CREATE TABLE IF NOT EXISTS tenant_ebitda_addbacks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  period_label TEXT NOT NULL,
  close_session_id TEXT NOT NULL,
  label TEXT NOT NULL,
  amount NUMERIC(20,2) NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ebitda_addbacks_session ON tenant_ebitda_addbacks(tenant_id, close_session_id);
