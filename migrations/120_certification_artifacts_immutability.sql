-- Protect certification_artifacts from modification.
-- Signed certifications must be tamper-proof at the database level.

CREATE OR REPLACE FUNCTION prevent_certification_artifact_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'certification_artifacts is immutable: % operations are prohibited', TG_OP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS certification_artifacts_immutable_update ON certification_artifacts;
CREATE TRIGGER certification_artifacts_immutable_update
  BEFORE UPDATE ON certification_artifacts
  FOR EACH ROW
  EXECUTE FUNCTION prevent_certification_artifact_mutation();

DROP TRIGGER IF EXISTS certification_artifacts_immutable_delete ON certification_artifacts;
CREATE TRIGGER certification_artifacts_immutable_delete
  BEFORE DELETE ON certification_artifacts
  FOR EACH ROW
  EXECUTE FUNCTION prevent_certification_artifact_mutation();
