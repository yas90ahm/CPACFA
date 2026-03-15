-- Add FOR UPDATE to the audit_ledger_enforce_chain trigger to prevent
-- race conditions when multiple concurrent inserts occur for the same tenant.
-- The FOR UPDATE lock serializes concurrent inserts so the chain is never broken.

CREATE OR REPLACE FUNCTION enforce_audit_ledger_chain()
RETURNS TRIGGER AS $$
DECLARE
  latest_hash TEXT;
BEGIN
  -- Find the latest entry_hash for this tenant with FOR UPDATE to prevent races
  SELECT entry_hash INTO latest_hash
  FROM audit_ledger
  WHERE tenant_id = NEW.tenant_id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  -- First entry for tenant: previous_entry_hash must be NULL
  IF latest_hash IS NULL THEN
    IF NEW.previous_entry_hash IS NOT NULL THEN
      RAISE EXCEPTION 'audit_ledger chain violation: first entry for tenant must have NULL previous_entry_hash, got %', NEW.previous_entry_hash;
    END IF;
  ELSE
    -- Subsequent entries: previous_entry_hash must match the latest entry_hash
    IF NEW.previous_entry_hash IS DISTINCT FROM latest_hash THEN
      RAISE EXCEPTION 'audit_ledger chain violation: previous_entry_hash (%) does not match latest entry_hash (%) for tenant %',
        COALESCE(NEW.previous_entry_hash, 'NULL'), latest_hash, NEW.tenant_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger itself does not change, but re-create to ensure consistency
DROP TRIGGER IF EXISTS audit_ledger_enforce_chain ON audit_ledger;
CREATE TRIGGER audit_ledger_enforce_chain
  BEFORE INSERT ON audit_ledger
  FOR EACH ROW
  EXECUTE FUNCTION enforce_audit_ledger_chain();
