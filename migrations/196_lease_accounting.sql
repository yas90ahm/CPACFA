-- Migration 196: ASC 842 Lease Accounting
-- Tables for leases, payment schedules, period entries, and modifications.

BEGIN;

-- Lease register
CREATE TABLE IF NOT EXISTS tenant_leases (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  entity_id             UUID NOT NULL,
  lease_name            TEXT NOT NULL,
  lease_type            TEXT NOT NULL CHECK (lease_type IN ('finance','operating')),
  commencement_date     DATE NOT NULL,
  term_months           INTEGER NOT NULL,
  monthly_payment       NUMERIC(20,2) NOT NULL,
  ibr_annual            NUMERIC(8,6) NOT NULL,
  rou_asset_initial     NUMERIC(20,2) NOT NULL DEFAULT 0,
  lease_liability_initial NUMERIC(20,2) NOT NULL DEFAULT 0,
  asset_account         TEXT NOT NULL DEFAULT '1800',
  liability_account     TEXT NOT NULL DEFAULT '2800',
  expense_account       TEXT NOT NULL DEFAULT '6200',
  interest_account      TEXT NOT NULL DEFAULT '7100',
  amortization_account  TEXT NOT NULL DEFAULT '6210',
  accum_amortization_account TEXT NOT NULL DEFAULT '1810',
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','terminated','modified')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leases_tenant_entity
  ON tenant_leases(tenant_id, entity_id);

-- Payment schedule (one row per period per lease)
CREATE TABLE IF NOT EXISTS tenant_lease_payment_schedule (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  lease_id              UUID NOT NULL REFERENCES tenant_leases(id),
  period_number         INTEGER NOT NULL,
  payment_date          DATE NOT NULL,
  payment_amount        NUMERIC(20,2) NOT NULL,
  interest_amount       NUMERIC(20,2) NOT NULL DEFAULT 0,
  principal_amount      NUMERIC(20,2) NOT NULL DEFAULT 0,
  beginning_liability   NUMERIC(20,2) NOT NULL DEFAULT 0,
  ending_liability      NUMERIC(20,2) NOT NULL DEFAULT 0,
  rou_amortization      NUMERIC(20,2) NOT NULL DEFAULT 0,
  straight_line_expense NUMERIC(20,2) NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lease_schedule_lease
  ON tenant_lease_payment_schedule(lease_id);
CREATE INDEX IF NOT EXISTS idx_lease_schedule_tenant
  ON tenant_lease_payment_schedule(tenant_id, lease_id);

-- Period entries (linking schedule rows to journal entries)
CREATE TABLE IF NOT EXISTS tenant_lease_period_entries (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  lease_id              UUID NOT NULL REFERENCES tenant_leases(id),
  close_session_id      UUID NOT NULL,
  schedule_id           UUID NOT NULL REFERENCES tenant_lease_payment_schedule(id),
  journal_entry_id      UUID,
  entry_type            TEXT NOT NULL CHECK (entry_type IN ('interest','amortization','operating_expense')),
  amount                NUMERIC(20,2) NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lease_period_entries_session
  ON tenant_lease_period_entries(tenant_id, close_session_id);

-- Lease modifications (remeasurement events)
CREATE TABLE IF NOT EXISTS tenant_lease_modifications (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  lease_id              UUID NOT NULL REFERENCES tenant_leases(id),
  modification_date     DATE NOT NULL,
  new_term_months       INTEGER,
  new_monthly_payment   NUMERIC(20,2),
  new_ibr_annual        NUMERIC(8,6),
  remeasured_liability  NUMERIC(20,2) NOT NULL DEFAULT 0,
  rou_adjustment        NUMERIC(20,2) NOT NULL DEFAULT 0,
  journal_entry_id      UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lease_modifications_lease
  ON tenant_lease_modifications(lease_id);

COMMIT;
