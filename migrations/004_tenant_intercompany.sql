-- Intercompany pairs and reconciliation results (tenant schema).

CREATE TABLE IF NOT EXISTS intercompany_pairs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  entity_a_id TEXT NOT NULL,
  entity_b_id TEXT NOT NULL,
  account_name_a TEXT NOT NULL,
  account_name_b TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ic_pairs_tenant ON intercompany_pairs(tenant_id);

CREATE TABLE IF NOT EXISTS intercompany_reconciliation_results (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  pair_id TEXT NOT NULL,
  period_label TEXT NOT NULL,
  matched_amount NUMERIC NOT NULL DEFAULT 0,
  balance_a NUMERIC NOT NULL DEFAULT 0,
  balance_b NUMERIC NOT NULL DEFAULT 0,
  variance NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  variance_detail TEXT,
  resolution TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ic_rec_tenant ON intercompany_reconciliation_results(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ic_rec_period ON intercompany_reconciliation_results(tenant_id, period_label);
CREATE INDEX IF NOT EXISTS idx_ic_rec_pair ON intercompany_reconciliation_results(tenant_id, pair_id);
