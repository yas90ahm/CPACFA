-- COA Mapping Rules: map source accounts to FS taxonomy lines (per tenant/entity, versioned).

CREATE TABLE IF NOT EXISTS coa_mapping_rules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  version INTEGER NOT NULL,
  source_account_name_pattern TEXT NOT NULL,
  source_account_number_pattern TEXT,
  mapped_fs_line_id TEXT NOT NULL,
  confidence_default NUMERIC NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_confidence_default CHECK (confidence_default >= 0 AND confidence_default <= 1)
);

CREATE INDEX IF NOT EXISTS idx_coa_rules_tenant_entity ON coa_mapping_rules(tenant_id, entity_id);
CREATE INDEX IF NOT EXISTS idx_coa_rules_version ON coa_mapping_rules(tenant_id, entity_id, version);
CREATE INDEX IF NOT EXISTS idx_coa_rules_effective ON coa_mapping_rules(tenant_id, entity_id, effective_from, effective_to);
