-- Per-tenant, per-period close due date (persist close calendar state).

CREATE TABLE IF NOT EXISTS tenant_close_calendar_entry (
  tenant_id TEXT NOT NULL,
  period_label TEXT NOT NULL,
  close_due_date DATE NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, period_label)
);
