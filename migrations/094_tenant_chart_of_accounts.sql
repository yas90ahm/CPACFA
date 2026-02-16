-- Chart of Accounts stored at tenant level (core schema).
-- COA is uploaded once during onboarding, reused for all periods.
-- GL entries will reference COA via account_code.

CREATE TABLE IF NOT EXISTS core.tenant_chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  account_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('Asset', 'Liability', 'Equity', 'Revenue', 'Expense')),
  account_subtype TEXT,
  parent_account_code TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  UNIQUE(tenant_id, account_code)
);

CREATE INDEX IF NOT EXISTS idx_tenant_coa_tenant ON core.tenant_chart_of_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_coa_code ON core.tenant_chart_of_accounts(tenant_id, account_code);
CREATE INDEX IF NOT EXISTS idx_tenant_coa_active ON core.tenant_chart_of_accounts(tenant_id, is_active) WHERE is_active = true;
