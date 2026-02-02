-- Leases (ASC 842 / IFRS 16): lease register and amortization schedules

CREATE TABLE IF NOT EXISTS leases (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  lease_name TEXT NOT NULL,
  classification TEXT NOT NULL, -- 'operating' | 'finance'
  commencement_date DATE NOT NULL,
  term_months INT NOT NULL,
  payment_frequency TEXT NOT NULL, -- 'monthly' | 'quarterly' | 'annual'
  payment_amount NUMERIC(15,2) NOT NULL,
  escalation_pct NUMERIC(5,4) DEFAULT 0,
  discount_rate NUMERIC(5,4) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  standard TEXT NOT NULL, -- 'asc842' | 'ifrs16'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lease_schedules (
  id TEXT PRIMARY KEY,
  lease_id TEXT NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  lease_payment NUMERIC(15,2) NOT NULL,
  interest_expense NUMERIC(15,2) NOT NULL,
  liability_reduction NUMERIC(15,2) NOT NULL,
  lease_liability NUMERIC(15,2) NOT NULL,
  rou_asset NUMERIC(15,2) NOT NULL,
  rou_amortization NUMERIC(15,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leases_tenant_id ON leases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lease_schedules_lease_id ON lease_schedules(lease_id);
CREATE INDEX IF NOT EXISTS idx_lease_schedules_period_start ON lease_schedules(period_start);
