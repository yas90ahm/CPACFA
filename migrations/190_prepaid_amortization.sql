-- Prepaid Amortization Schedule tables
-- ASC 340-10: Prepaid expenses recognized ratably over benefit period

CREATE TABLE IF NOT EXISTS tenant_prepaid_schedules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL,
  entity_id       UUID,
  close_session_id UUID NOT NULL,
  description     TEXT NOT NULL,
  vendor          TEXT,
  prepaid_account TEXT NOT NULL,
  expense_account TEXT NOT NULL,
  total_amount    NUMERIC(20,2) NOT NULL CHECK (total_amount > 0),
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL CHECK (end_date > start_date),
  months_count    INT NOT NULL CHECK (months_count > 0),
  monthly_amount  NUMERIC(20,2) GENERATED ALWAYS AS (ROUND(total_amount / months_count, 2)) STORED,
  amortized_to_date NUMERIC(20,2) NOT NULL DEFAULT 0,
  remaining_balance NUMERIC(20,2) GENERATED ALWAYS AS (total_amount - amortized_to_date) STORED,
  fully_amortized BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prepaid_schedules_tenant
  ON tenant_prepaid_schedules (tenant_id);
CREATE INDEX IF NOT EXISTS idx_prepaid_schedules_session
  ON tenant_prepaid_schedules (close_session_id);
CREATE INDEX IF NOT EXISTS idx_prepaid_schedules_active
  ON tenant_prepaid_schedules (tenant_id, fully_amortized) WHERE NOT fully_amortized;

CREATE TABLE IF NOT EXISTS tenant_prepaid_amortization_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL,
  schedule_id     UUID NOT NULL REFERENCES tenant_prepaid_schedules(id),
  close_session_id UUID NOT NULL,
  period_label    TEXT NOT NULL,
  amount          NUMERIC(20,2) NOT NULL,
  je_id           UUID,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'proposed', 'posted')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prepaid_entries_schedule
  ON tenant_prepaid_amortization_entries (schedule_id);
CREATE INDEX IF NOT EXISTS idx_prepaid_entries_session
  ON tenant_prepaid_amortization_entries (close_session_id);
