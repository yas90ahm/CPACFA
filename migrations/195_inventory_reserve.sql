-- Migration 195: Inventory Obsolescence Reserve (ASC 330)
-- Tables for inventory aging snapshots, reserve configuration, and reserve computations.

BEGIN;

-- Inventory aging snapshot rows (imported from CSV)
CREATE TABLE IF NOT EXISTS tenant_inventory_aging (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      TEXT NOT NULL,
  entity_id      UUID NOT NULL,
  close_session_id UUID NOT NULL,
  snapshot_id    UUID NOT NULL,
  item_code      TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  quantity       NUMERIC(20,4) NOT NULL DEFAULT 0,
  unit_cost      NUMERIC(20,2) NOT NULL DEFAULT 0,
  total_cost     NUMERIC(20,2) NOT NULL DEFAULT 0,
  last_movement_date DATE,
  days_since_movement INTEGER NOT NULL DEFAULT 0,
  aging_bucket   TEXT NOT NULL DEFAULT 'current'
    CHECK (aging_bucket IN ('current','91_180','181_365','over_365')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_aging_tenant_session
  ON tenant_inventory_aging(tenant_id, close_session_id);
CREATE INDEX IF NOT EXISTS idx_inventory_aging_snapshot
  ON tenant_inventory_aging(snapshot_id);

-- Reserve configuration per entity (reserve rates per aging bucket)
CREATE TABLE IF NOT EXISTS tenant_inventory_reserve_config (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      TEXT NOT NULL,
  entity_id      UUID NOT NULL,
  rate_current   NUMERIC(5,4) NOT NULL DEFAULT 0.0000,
  rate_91_180    NUMERIC(5,4) NOT NULL DEFAULT 0.2500,
  rate_181_365   NUMERIC(5,4) NOT NULL DEFAULT 0.5000,
  rate_over_365  NUMERIC(5,4) NOT NULL DEFAULT 1.0000,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, entity_id)
);

-- Reserve computation results
CREATE TABLE IF NOT EXISTS tenant_inventory_reserve_computations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  entity_id         UUID NOT NULL,
  close_session_id  UUID NOT NULL,
  snapshot_id       UUID NOT NULL,
  total_inventory   NUMERIC(20,2) NOT NULL DEFAULT 0,
  bucket_current    NUMERIC(20,2) NOT NULL DEFAULT 0,
  bucket_91_180     NUMERIC(20,2) NOT NULL DEFAULT 0,
  bucket_181_365    NUMERIC(20,2) NOT NULL DEFAULT 0,
  bucket_over_365   NUMERIC(20,2) NOT NULL DEFAULT 0,
  reserve_current   NUMERIC(20,2) NOT NULL DEFAULT 0,
  reserve_91_180    NUMERIC(20,2) NOT NULL DEFAULT 0,
  reserve_181_365   NUMERIC(20,2) NOT NULL DEFAULT 0,
  reserve_over_365  NUMERIC(20,2) NOT NULL DEFAULT 0,
  required_reserve  NUMERIC(20,2) NOT NULL DEFAULT 0,
  current_gl_reserve NUMERIC(20,2) NOT NULL DEFAULT 0,
  adjustment_needed NUMERIC(20,2) GENERATED ALWAYS AS (required_reserve - current_gl_reserve) STORED,
  journal_entry_id  UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_reserve_comp_tenant_session
  ON tenant_inventory_reserve_computations(tenant_id, close_session_id);

COMMIT;
