-- Immutable ledger snapshots for certification and export/binder generation.
-- Snapshot payload (JSONB) holds canonical TB + entries; snapshot_hash is SHA-256 of canonical JSON.

CREATE TABLE IF NOT EXISTS ledger_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  period_label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  source TEXT NOT NULL,
  snapshot_payload_json JSONB NOT NULL,
  snapshot_hash TEXT NOT NULL,
  hash_version INTEGER NOT NULL DEFAULT 1,
  close_session_id TEXT,
  CONSTRAINT chk_ledger_snapshot_source CHECK (source IN ('precheck', 'close_session', 'import'))
);

CREATE INDEX IF NOT EXISTS idx_ledger_snapshots_tenant ON ledger_snapshots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ledger_snapshots_tenant_period ON ledger_snapshots(tenant_id, period_label);
CREATE INDEX IF NOT EXISTS idx_ledger_snapshots_close_session ON ledger_snapshots(close_session_id);
CREATE INDEX IF NOT EXISTS idx_ledger_snapshots_hash ON ledger_snapshots(tenant_id, snapshot_hash);
