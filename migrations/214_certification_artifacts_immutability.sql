-- Tamper-proof enforcement: database triggers block UPDATE/DELETE on certification_artifacts.
-- Certification artifacts are cryptographically signed records that MUST be immutable once created.
-- This closes the gap identified in the audit: audit_ledger and ledger_snapshots had triggers (migration 091),
-- but certification_artifacts did not.

-- certification_artifacts: immutable once created, no UPDATE or DELETE
CREATE OR REPLACE FUNCTION prevent_certification_artifacts_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'certification_artifacts is immutable: % operations are prohibited', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS certification_artifacts_no_update ON certification_artifacts;
CREATE TRIGGER certification_artifacts_no_update
  BEFORE UPDATE ON certification_artifacts
  FOR EACH ROW EXECUTE FUNCTION prevent_certification_artifacts_mutation();

DROP TRIGGER IF EXISTS certification_artifacts_no_delete ON certification_artifacts;
CREATE TRIGGER certification_artifacts_no_delete
  BEFORE DELETE ON certification_artifacts
  FOR EACH ROW EXECUTE FUNCTION prevent_certification_artifacts_mutation();
