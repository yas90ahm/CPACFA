-- Gate status snapshots: persisted gate check results for monitoring and auto-advance.

CREATE TABLE IF NOT EXISTS tenant_gate_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  close_session_id UUID NOT NULL REFERENCES close_sessions(id),
  gates_passing INTEGER NOT NULL DEFAULT 0,
  gates_total INTEGER NOT NULL DEFAULT 0,
  can_advance BOOLEAN NOT NULL DEFAULT FALSE,
  gate_details JSONB NOT NULL DEFAULT '[]',
  triggered_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gate_snapshots_session
  ON tenant_gate_snapshots(tenant_id, close_session_id);
CREATE INDEX IF NOT EXISTS idx_gate_snapshots_latest
  ON tenant_gate_snapshots(tenant_id, close_session_id, created_at DESC);
