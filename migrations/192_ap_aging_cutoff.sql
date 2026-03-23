-- AP Aging + Cutoff Analysis tables
-- ASC 405-20: Accounts Payable, cutoff testing per AU-C 330

CREATE TABLE IF NOT EXISTS tenant_ap_aging_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  entity_id       UUID,
  close_session_id UUID NOT NULL,
  snapshot_date   DATE NOT NULL,
  total_ap        NUMERIC(20,2) NOT NULL DEFAULT 0,
  record_count    INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ap_aging_snapshots_tenant
  ON tenant_ap_aging_snapshots (tenant_id);
CREATE INDEX IF NOT EXISTS idx_ap_aging_snapshots_session
  ON tenant_ap_aging_snapshots (close_session_id);

CREATE TABLE IF NOT EXISTS tenant_ap_aging_detail (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  snapshot_id     UUID NOT NULL REFERENCES tenant_ap_aging_snapshots(id),
  vendor_name     TEXT NOT NULL,
  invoice_number  TEXT,
  invoice_date    DATE NOT NULL,
  due_date        DATE NOT NULL,
  amount          NUMERIC(20,2) NOT NULL,
  days_outstanding INT NOT NULL,
  aging_bucket    TEXT NOT NULL CHECK (aging_bucket IN ('current', '1-30', '31-60', '61-90', '91-120', '120+')),
  is_past_due     BOOLEAN GENERATED ALWAYS AS (days_outstanding > 0) STORED,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ap_aging_detail_snapshot
  ON tenant_ap_aging_detail (snapshot_id);

CREATE TABLE IF NOT EXISTS tenant_ap_cutoff_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  close_session_id UUID NOT NULL,
  snapshot_id     UUID REFERENCES tenant_ap_aging_snapshots(id),
  vendor_name     TEXT NOT NULL,
  invoice_number  TEXT,
  invoice_date    DATE NOT NULL,
  amount          NUMERIC(20,2) NOT NULL,
  expense_account TEXT,
  disposition     TEXT NOT NULL DEFAULT 'review' CHECK (disposition IN ('review', 'accrue', 'exclude')),
  reason          TEXT,
  je_id           UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ap_cutoff_items_session
  ON tenant_ap_cutoff_items (close_session_id);
