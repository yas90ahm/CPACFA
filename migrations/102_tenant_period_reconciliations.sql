-- Period reconciliations: per close period, per required account (Step 5).
-- variance, is_within_tolerance, unexplained_variance are DB-computed (GENERATED).

CREATE TABLE IF NOT EXISTS tenant_period_reconciliations (
  recon_id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  tenant_id TEXT NOT NULL,
  period_id TEXT NOT NULL REFERENCES close_sessions(id),
  entity_id TEXT NOT NULL,
  requirement_id TEXT NOT NULL REFERENCES tenant_recon_requirements(requirement_id),
  account_code TEXT NOT NULL,

  gl_balance NUMERIC(20,2),
  supporting_balance NUMERIC(20,2),
  variance NUMERIC(20,2) GENERATED ALWAYS AS (gl_balance - supporting_balance) STORED,

  tolerance_amount NUMERIC(20,2) NOT NULL DEFAULT 0.00,
  is_within_tolerance BOOLEAN GENERATED ALWAYS AS (
    (gl_balance IS NOT NULL AND supporting_balance IS NOT NULL)
    AND (ABS(gl_balance - supporting_balance) <= tolerance_amount)
  ) STORED,

  reconciling_items_total NUMERIC(20,2) DEFAULT 0.00,
  unexplained_variance NUMERIC(20,2) GENERATED ALWAYS AS (
    (gl_balance - supporting_balance) - COALESCE(reconciling_items_total, 0)
  ) STORED,

  supporting_source TEXT,
  supporting_document_refs TEXT[] DEFAULT '{}',

  variance_explanation TEXT,

  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'completed', 'approved')),

  prepared_by TEXT,
  prepared_at TIMESTAMPTZ,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(period_id, account_code)
);

CREATE TABLE IF NOT EXISTS tenant_recon_items (
  item_id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  recon_id TEXT NOT NULL REFERENCES tenant_period_reconciliations(recon_id) ON DELETE CASCADE,

  description TEXT NOT NULL,
  amount NUMERIC(20,2) NOT NULL,
  item_type TEXT NOT NULL
    CHECK (item_type IN (
      'outstanding_check', 'deposit_in_transit', 'bank_fee',
      'timing_difference', 'error_correction', 'other'
    )),

  needs_aje BOOLEAN NOT NULL DEFAULT false,
  aje_id TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_period_recons_period ON tenant_period_reconciliations(period_id);
CREATE INDEX IF NOT EXISTS idx_period_recons_status ON tenant_period_reconciliations(status);
CREATE INDEX IF NOT EXISTS idx_period_recons_tenant_entity ON tenant_period_reconciliations(tenant_id, entity_id);
CREATE INDEX IF NOT EXISTS idx_recon_items_recon ON tenant_recon_items(recon_id);
