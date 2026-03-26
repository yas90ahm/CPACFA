-- GL immutability after certification (blind audit finding #5)
--
-- General ledger entries must remain modifiable before certification (re-upload, correction).
-- After a period is certified, GL entries for that period become immutable at the DB level.
-- This closes the gap identified in the blind audit: audit_ledger, ledger_snapshots,
-- certification_artifacts all have immutability triggers, but general_ledger did not.
--
-- The trigger checks if a certification_artifacts row exists for the same tenant + period.
-- Before any certification exists, the trigger allows all operations (normal GL workflow).

CREATE OR REPLACE FUNCTION prevent_certified_gl_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM certification_artifacts ca
    WHERE ca.tenant_id = OLD.tenant_id
      AND ca.period_label = OLD.period_label
  ) THEN
    RAISE EXCEPTION 'GL entry cannot be modified after period certification: % on tenant=% period=%',
      TG_OP, OLD.tenant_id, OLD.period_label;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    RETURN NEW;
  ELSE
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS general_ledger_immutable_after_certification_update ON core.general_ledger;
CREATE TRIGGER general_ledger_immutable_after_certification_update
  BEFORE UPDATE ON core.general_ledger
  FOR EACH ROW EXECUTE FUNCTION prevent_certified_gl_mutation();

DROP TRIGGER IF EXISTS general_ledger_immutable_after_certification_delete ON core.general_ledger;
CREATE TRIGGER general_ledger_immutable_after_certification_delete
  BEFORE DELETE ON core.general_ledger
  FOR EACH ROW EXECUTE FUNCTION prevent_certified_gl_mutation();
