-- AR Aging + CECL Allowance tables
-- ASC 326-20: Current Expected Credit Losses (CECL)

CREATE TABLE IF NOT EXISTS tenant_ar_aging_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL,
  entity_id       UUID,
  close_session_id UUID NOT NULL,
  snapshot_date   DATE NOT NULL,
  total_ar        NUMERIC(20,2) NOT NULL DEFAULT 0,
  record_count    INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ar_aging_snapshots_tenant
  ON tenant_ar_aging_snapshots (tenant_id);
CREATE INDEX IF NOT EXISTS idx_ar_aging_snapshots_session
  ON tenant_ar_aging_snapshots (close_session_id);

CREATE TABLE IF NOT EXISTS tenant_ar_aging_detail (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL,
  snapshot_id     UUID NOT NULL REFERENCES tenant_ar_aging_snapshots(id),
  customer_name   TEXT NOT NULL,
  invoice_number  TEXT,
  invoice_date    DATE NOT NULL,
  due_date        DATE NOT NULL,
  amount          NUMERIC(20,2) NOT NULL,
  days_outstanding INT NOT NULL,
  aging_bucket    TEXT NOT NULL CHECK (aging_bucket IN ('current', '1-30', '31-60', '61-90', '91-120', '120+')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ar_aging_detail_snapshot
  ON tenant_ar_aging_detail (snapshot_id);

CREATE TABLE IF NOT EXISTS tenant_cecl_config (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL,
  entity_id       UUID,
  bucket_current_rate   NUMERIC(8,6) NOT NULL DEFAULT 0.005,
  bucket_1_30_rate      NUMERIC(8,6) NOT NULL DEFAULT 0.01,
  bucket_31_60_rate     NUMERIC(8,6) NOT NULL DEFAULT 0.03,
  bucket_61_90_rate     NUMERIC(8,6) NOT NULL DEFAULT 0.07,
  bucket_91_120_rate    NUMERIC(8,6) NOT NULL DEFAULT 0.15,
  bucket_120_plus_rate  NUMERIC(8,6) NOT NULL DEFAULT 0.30,
  allowance_account     TEXT NOT NULL DEFAULT '1299',
  bad_debt_account      TEXT NOT NULL DEFAULT '6800',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, entity_id)
);

CREATE TABLE IF NOT EXISTS tenant_cecl_computations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL,
  snapshot_id     UUID NOT NULL REFERENCES tenant_ar_aging_snapshots(id),
  close_session_id UUID NOT NULL,
  required_allowance NUMERIC(20,2) NOT NULL,
  current_allowance  NUMERIC(20,2) NOT NULL DEFAULT 0,
  adjustment_needed  NUMERIC(20,2) GENERATED ALWAYS AS (required_allowance - current_allowance) STORED,
  je_id           UUID,
  status          TEXT NOT NULL DEFAULT 'computed' CHECK (status IN ('computed', 'proposed', 'posted')),
  detail_json     JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cecl_computations_session
  ON tenant_cecl_computations (close_session_id);
