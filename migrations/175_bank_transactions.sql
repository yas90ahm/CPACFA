-- Bank/source transactions for transaction-level reconciliation matching.
-- Ingested from bank statement uploads (CSV/OFX/QFX) or accounting integrations.

CREATE TABLE IF NOT EXISTS tenant_bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  period_id UUID NOT NULL REFERENCES close_sessions(id),
  account_code TEXT NOT NULL,

  -- Transaction data
  transaction_date DATE NOT NULL,
  post_date DATE,
  description TEXT NOT NULL DEFAULT '',
  reference TEXT,
  check_number TEXT,
  amount NUMERIC(20,2) NOT NULL,
  running_balance NUMERIC(20,2),

  -- Categorization
  transaction_type TEXT NOT NULL DEFAULT 'other'
    CHECK (transaction_type IN ('deposit', 'withdrawal', 'transfer', 'fee', 'interest', 'check', 'other')),
  counterparty TEXT,

  -- Source tracking
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('csv_upload', 'ofx_upload', 'integration_sync', 'manual')),
  source_file_name TEXT,
  external_id TEXT,

  -- Match status
  match_status TEXT NOT NULL DEFAULT 'unmatched'
    CHECK (match_status IN ('unmatched', 'matched', 'excluded')),
  matched_gl_entry_id TEXT,
  match_group_id UUID,
  match_confidence NUMERIC(5,4),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,

  UNIQUE (tenant_id, external_id) -- Prevent duplicate imports
);

CREATE INDEX IF NOT EXISTS idx_bank_txn_tenant_period ON tenant_bank_transactions(tenant_id, period_id);
CREATE INDEX IF NOT EXISTS idx_bank_txn_account ON tenant_bank_transactions(tenant_id, account_code);
CREATE INDEX IF NOT EXISTS idx_bank_txn_match_status ON tenant_bank_transactions(tenant_id, match_status);
CREATE INDEX IF NOT EXISTS idx_bank_txn_date ON tenant_bank_transactions(tenant_id, transaction_date);

-- GL transactions extracted for matching (denormalized from GL entries for fast matching)
CREATE TABLE IF NOT EXISTS tenant_gl_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  period_id UUID NOT NULL REFERENCES close_sessions(id),
  account_code TEXT NOT NULL,

  -- Transaction data
  entry_date DATE NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  reference TEXT,
  debit NUMERIC(20,2) NOT NULL DEFAULT 0,
  credit NUMERIC(20,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(20,2) GENERATED ALWAYS AS (debit - credit) STORED,

  -- Source
  gl_entry_id TEXT,
  gl_line_number INTEGER,

  -- Match status
  match_status TEXT NOT NULL DEFAULT 'unmatched'
    CHECK (match_status IN ('unmatched', 'matched', 'excluded')),
  match_group_id UUID,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gl_txn_tenant_period ON tenant_gl_transactions(tenant_id, period_id);
CREATE INDEX IF NOT EXISTS idx_gl_txn_account ON tenant_gl_transactions(tenant_id, account_code);
CREATE INDEX IF NOT EXISTS idx_gl_txn_match_status ON tenant_gl_transactions(tenant_id, match_status);

-- Match groups: links bank transactions to GL transactions
CREATE TABLE IF NOT EXISTS tenant_transaction_match_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  period_id UUID NOT NULL REFERENCES close_sessions(id),
  recon_id UUID,

  match_type TEXT NOT NULL DEFAULT 'one_to_one'
    CHECK (match_type IN ('one_to_one', 'one_to_many', 'many_to_one', 'many_to_many')),
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'confirmed', 'rejected')),
  confidence_score NUMERIC(5,4),
  match_method TEXT NOT NULL DEFAULT 'manual'
    CHECK (match_method IN ('exact_amount', 'fuzzy', 'rule_based', 'manual')),

  confirmed_by TEXT,
  confirmed_at TIMESTAMPTZ,
  rejected_by TEXT,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_match_groups_tenant ON tenant_transaction_match_groups(tenant_id, period_id);
CREATE INDEX IF NOT EXISTS idx_match_groups_status ON tenant_transaction_match_groups(tenant_id, status);
