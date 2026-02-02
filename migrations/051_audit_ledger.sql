-- Immutable audit ledger: hash-chained, append-only log of human overrides.
-- No UPDATE/DELETE from application code.

CREATE TABLE IF NOT EXISTS audit_ledger (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  period_label TEXT,
  event_type TEXT NOT NULL,
  deterministic_flag_snapshot JSONB NOT NULL DEFAULT '{}',
  agent_dissent_snapshot JSONB,
  user_prompt_rationale TEXT NOT NULL,
  previous_entry_hash TEXT,
  entry_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_ledger_tenant_id ON audit_ledger(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_ledger_tenant_created ON audit_ledger(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_ledger_tenant_event ON audit_ledger(tenant_id, event_type);
