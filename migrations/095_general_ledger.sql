-- General Ledger: stores uploaded journal entries per tenant and period.
-- GL is aggregated to derive Trial Balance. Each entry_id group must balance.

CREATE TABLE IF NOT EXISTS core.general_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  period_label TEXT NOT NULL,

  -- Entry grouping
  entry_id TEXT NOT NULL,
  line_number INTEGER NOT NULL,

  -- Transaction details
  entry_date DATE NOT NULL,
  account_code TEXT NOT NULL,
  debit NUMERIC(20, 2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit NUMERIC(20, 2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  description TEXT,

  -- Additional metadata
  amount_provenance TEXT,
  source TEXT NOT NULL DEFAULT 'upload',

  -- Audit trail
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,

  -- A line is either debit OR credit, not both
  CONSTRAINT chk_gl_line_debit_or_credit CHECK (debit = 0 OR credit = 0),
  UNIQUE(tenant_id, period_label, entry_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_gl_tenant_period ON core.general_ledger(tenant_id, period_label);
CREATE INDEX IF NOT EXISTS idx_gl_entry_id ON core.general_ledger(tenant_id, period_label, entry_id);
CREATE INDEX IF NOT EXISTS idx_gl_account ON core.general_ledger(tenant_id, period_label, account_code);
CREATE INDEX IF NOT EXISTS idx_gl_date ON core.general_ledger(tenant_id, period_label, entry_date);

COMMENT ON TABLE core.general_ledger IS 'Stores uploaded journal entries (GL) per tenant and period';
