-- Debt Interest Accrual Schedule tables
-- Module 4: Track debt instruments and compute periodic interest accruals

CREATE TABLE IF NOT EXISTS tenant_debt_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  entity_id UUID NOT NULL,
  lender_name TEXT NOT NULL,
  instrument_type TEXT NOT NULL DEFAULT 'term_loan',
  principal_balance NUMERIC(20,2) NOT NULL,
  annual_rate NUMERIC(10,6) NOT NULL,
  interest_expense_account TEXT NOT NULL,
  accrued_interest_account TEXT NOT NULL,
  maturity_date DATE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_debt_schedules_tenant ON tenant_debt_schedules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_debt_schedules_entity ON tenant_debt_schedules(tenant_id, entity_id);

CREATE TABLE IF NOT EXISTS tenant_debt_accrual_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  debt_schedule_id UUID NOT NULL REFERENCES tenant_debt_schedules(id),
  close_session_id UUID NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  days_in_period INTEGER NOT NULL,
  daily_rate NUMERIC(20,10) NOT NULL,
  accrual_amount NUMERIC(20,2) NOT NULL,
  je_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_debt_accrual_entries_session ON tenant_debt_accrual_entries(tenant_id, close_session_id);
CREATE INDEX IF NOT EXISTS idx_debt_accrual_entries_schedule ON tenant_debt_accrual_entries(debt_schedule_id);
