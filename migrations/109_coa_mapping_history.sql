-- Mapping version history: append-only log of COA mapping rule changes.

CREATE TABLE IF NOT EXISTS coa_mapping_history (
  history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,

  source_account_name_pattern TEXT NOT NULL,
  source_account_number_pattern TEXT,
  mapped_fs_line_id TEXT NOT NULL,
  confidence_default NUMERIC NOT NULL DEFAULT 1,

  version_number INTEGER NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  changed_by TEXT,
  change_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coa_mapping_history_tenant_entity
  ON coa_mapping_history(tenant_id, entity_id);
CREATE INDEX IF NOT EXISTS idx_coa_mapping_history_effective
  ON coa_mapping_history(effective_from, effective_to);

CREATE OR REPLACE FUNCTION prevent_coa_mapping_history_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'coa_mapping_history is append-only. Updates and deletes are not permitted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS coa_mapping_history_immutable_update ON coa_mapping_history;
CREATE TRIGGER coa_mapping_history_immutable_update
  BEFORE UPDATE ON coa_mapping_history
  FOR EACH ROW EXECUTE FUNCTION prevent_coa_mapping_history_modification();

DROP TRIGGER IF EXISTS coa_mapping_history_immutable_delete ON coa_mapping_history;
CREATE TRIGGER coa_mapping_history_immutable_delete
  BEFORE DELETE ON coa_mapping_history
  FOR EACH ROW EXECUTE FUNCTION prevent_coa_mapping_history_modification();
