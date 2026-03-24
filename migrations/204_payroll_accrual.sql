DROP TABLE IF EXISTS tenant_payroll_accrual_entries CASCADE;
DROP TABLE IF EXISTS tenant_payroll_config CASCADE;

-- Payroll Accrual tables
-- Module 5: Track payroll configuration and compute periodic payroll accruals

CREATE TABLE IF NOT EXISTS tenant_payroll_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  average_daily_payroll NUMERIC(20,2) NOT NULL DEFAULT 0,
  last_payroll_date DATE,
  wages_expense_account TEXT NOT NULL,
  accrued_wages_account TEXT NOT NULL,
  payroll_tax_expense_account TEXT,
  accrued_payroll_tax_account TEXT,
  benefits_expense_account TEXT,
  accrued_benefits_account TEXT,
  average_daily_tax NUMERIC(20,2) NOT NULL DEFAULT 0,
  average_daily_benefits NUMERIC(20,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_payroll_config_tenant ON tenant_payroll_config(tenant_id);

CREATE TABLE IF NOT EXISTS tenant_payroll_accrual_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  close_session_id TEXT NOT NULL,
  period_end DATE NOT NULL,
  days_accrued INTEGER NOT NULL,
  wages_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
  benefits_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
  je_id UUID,
  source TEXT NOT NULL DEFAULT 'computed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_accrual_entries_session ON tenant_payroll_accrual_entries(tenant_id, close_session_id);
CREATE INDEX IF NOT EXISTS idx_payroll_accrual_entries_entity ON tenant_payroll_accrual_entries(tenant_id, entity_id);
