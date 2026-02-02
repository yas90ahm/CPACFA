-- Revenue recognition: contracts, performance obligations, schedule (IFRS 15 / ASC 606)

CREATE TABLE IF NOT EXISTS revenue_contracts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  contract_number TEXT NOT NULL,
  customer_id TEXT,
  customer_name TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_contract_value NUMERIC(15,2) NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  allocation JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS revenue_performance_obligations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  contract_id TEXT NOT NULL REFERENCES revenue_contracts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  satisfied_over_time BOOLEAN NOT NULL DEFAULT true,
  allocation_percent NUMERIC(5,2),
  allocation_amount NUMERIC(15,2),
  schedule JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS revenue_recognition_schedule (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  contract_id TEXT NOT NULL REFERENCES revenue_contracts(id) ON DELETE CASCADE,
  pob_id TEXT NOT NULL REFERENCES revenue_performance_obligations(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  amount NUMERIC(15,2) NOT NULL,
  cumulative_amount NUMERIC(15,2),
  recognized BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_revenue_contracts_tenant_id ON revenue_contracts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_revenue_contracts_status ON revenue_contracts(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_revenue_pob_contract_id ON revenue_performance_obligations(contract_id);
CREATE INDEX IF NOT EXISTS idx_revenue_pob_tenant_id ON revenue_performance_obligations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_revenue_schedule_tenant_contract ON revenue_recognition_schedule(tenant_id, contract_id);
CREATE INDEX IF NOT EXISTS idx_revenue_schedule_period ON revenue_recognition_schedule(contract_id, period_start);
