-- Recurring close calendar config per tenant: close due offset (e.g. 5 = 5th of next month).

CREATE TABLE IF NOT EXISTS tenant_close_calendar_config (
  tenant_id TEXT PRIMARY KEY,
  close_due_offset_days INTEGER NOT NULL DEFAULT 5,
  reminder_days INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
