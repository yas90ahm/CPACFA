-- FinOS Agent: tenant DB schema only (no tenants/users; for customer-held DB).
-- Run on tenant DB via: npm run migrate:tenant -- <DATABASE_URL> or on first getTenantPool.

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounting_connections (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  name TEXT NOT NULL,
  credential_ref TEXT NOT NULL,
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acct_conn_tenant ON accounting_connections(tenant_id);

CREATE TABLE IF NOT EXISTS period_locks (
  tenant_id TEXT NOT NULL,
  period_label TEXT NOT NULL,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_by TEXT NOT NULL,
  reason TEXT,
  PRIMARY KEY (tenant_id, period_label)
);

CREATE TABLE IF NOT EXISTS close_adjustments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  period_label TEXT NOT NULL,
  source TEXT NOT NULL,
  description TEXT NOT NULL,
  debits JSONB NOT NULL DEFAULT '[]',
  credits JSONB NOT NULL DEFAULT '[]',
  source_detail TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_close_adj_tenant ON close_adjustments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_close_adj_period ON close_adjustments(tenant_id, period_label);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT,
  detail TEXT,
  payload JSONB
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant_time ON audit_log(tenant_id, timestamp);
