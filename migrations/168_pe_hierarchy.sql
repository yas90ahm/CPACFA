-- Renumbered from 068 to 168 to resolve duplicate prefix
-- GAP I1: PE reporting hierarchy — custom line-item groupings for PE-backed companies.

CREATE TABLE IF NOT EXISTS tenant_pe_hierarchy (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  pe_line_id TEXT NOT NULL,
  pe_line_name TEXT NOT NULL,
  parent_pe_line_id TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  statement TEXT NOT NULL DEFAULT 'PL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, pe_line_id)
);

CREATE INDEX IF NOT EXISTS idx_pe_hierarchy_tenant ON tenant_pe_hierarchy(tenant_id);

ALTER TABLE coa_mapping_rules ADD COLUMN IF NOT EXISTS pe_line_id TEXT;
