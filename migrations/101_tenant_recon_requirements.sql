-- Reconciliation requirements per entity: which accounts require reconciliation (Step 5).
-- Configured once per entity; applies to all close periods.

CREATE TABLE IF NOT EXISTS tenant_recon_requirements (
  requirement_id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  tenant_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,

  account_code TEXT NOT NULL,
  account_name TEXT,

  is_required BOOLEAN NOT NULL DEFAULT true,
  tolerance_amount NUMERIC(20,2) NOT NULL DEFAULT 0.00,
  tolerance_type TEXT NOT NULL DEFAULT 'absolute'
    CHECK (tolerance_type IN ('absolute', 'percentage')),
  tolerance_percentage NUMERIC(5,2) DEFAULT 0.00,

  expected_source TEXT NOT NULL DEFAULT 'other'
    CHECK (expected_source IN (
      'bank_statement', 'subledger', 'aging_report',
      'amortization_schedule', 'loan_statement',
      'physical_count', 'rollforward', 'schedule', 'other'
    )),

  requires_reviewer_approval BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,

  UNIQUE(tenant_id, entity_id, account_code)
);

CREATE INDEX IF NOT EXISTS idx_recon_requirements_entity ON tenant_recon_requirements(tenant_id, entity_id);
