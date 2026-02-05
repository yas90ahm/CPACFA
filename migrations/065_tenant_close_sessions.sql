-- Close session: (tenant, entity, period_start, period_end, basis, standard).
-- Imports, issues, reconciliations, JEs, statements, exports attach to close_session_id.
-- No overlapping sessions per tenant+entity (enforced by EXCLUDE).

CREATE TABLE IF NOT EXISTS close_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  basis TEXT NOT NULL DEFAULT 'accrual',
  standard TEXT NOT NULL DEFAULT 'GAAP',
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_period_order CHECK (period_start <= period_end),
  CONSTRAINT chk_basis CHECK (basis IN ('cash', 'accrual')),
  CONSTRAINT chk_status CHECK (status IN ('draft', 'in_progress', 'ready_for_review', 'finalized', 'locked'))
);

CREATE INDEX IF NOT EXISTS idx_close_sessions_tenant ON close_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_close_sessions_tenant_entity ON close_sessions(tenant_id, entity_id);
CREATE INDEX IF NOT EXISTS idx_close_sessions_period ON close_sessions(tenant_id, entity_id, period_start, period_end);

-- Prevent overlapping (period_start, period_end) for same tenant_id + entity_id.
CREATE EXTENSION IF NOT EXISTS btree_gist;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'close_sessions'::regclass AND conname = 'no_overlapping_sessions'
  ) THEN
    ALTER TABLE close_sessions
      ADD CONSTRAINT no_overlapping_sessions
      EXCLUDE USING gist (
        tenant_id WITH =,
        entity_id WITH =,
        daterange(period_start, period_end, '[]') WITH &&
      );
  END IF;
END $$;
