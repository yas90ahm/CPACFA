-- KPI snapshots per tenant (append-only; trend over time).

CREATE TABLE IF NOT EXISTS kpi_snapshots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  period_label TEXT NOT NULL,
  as_at TIMESTAMPTZ NOT NULL,
  kpis JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_tenant ON kpi_snapshots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_tenant_as_at ON kpi_snapshots(tenant_id, as_at);
