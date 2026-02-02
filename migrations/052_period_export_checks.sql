-- Period-level export checks: rounding/materiality flags persisted when consolidation or statement build runs.
-- Export gate reads these so export can be blocked without trusting client-supplied flags.

CREATE TABLE IF NOT EXISTS period_export_checks (
  tenant_id TEXT NOT NULL,
  period_label TEXT NOT NULL,
  rounding_gap_exceeds_materiality BOOLEAN NOT NULL DEFAULT false,
  aggregate_rounding_exceeds_materiality BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, period_label)
);

CREATE INDEX IF NOT EXISTS idx_period_export_checks_tenant ON period_export_checks(tenant_id);
