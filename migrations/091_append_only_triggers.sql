-- Tamper-proof enforcement: database triggers block UPDATE/DELETE on critical audit tables.
-- When an auditor asks "how do you prevent tampering at the database level?", the answer
-- is: "Database triggers block any UPDATE or DELETE, and we can verify triggers exist."

-- 1. audit_ledger: append-only, no UPDATE or DELETE
CREATE OR REPLACE FUNCTION prevent_audit_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_ledger is append-only: % operations are prohibited', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_ledger_no_update ON audit_ledger;
CREATE TRIGGER audit_ledger_no_update
  BEFORE UPDATE ON audit_ledger
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_ledger_mutation();

DROP TRIGGER IF EXISTS audit_ledger_no_delete ON audit_ledger;
CREATE TRIGGER audit_ledger_no_delete
  BEFORE DELETE ON audit_ledger
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_ledger_mutation();

-- 2. ledger_snapshots: immutable once created
CREATE OR REPLACE FUNCTION prevent_ledger_snapshots_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'ledger_snapshots is immutable: % operations are prohibited', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ledger_snapshots_no_update ON ledger_snapshots;
CREATE TRIGGER ledger_snapshots_no_update
  BEFORE UPDATE ON ledger_snapshots
  FOR EACH ROW EXECUTE FUNCTION prevent_ledger_snapshots_mutation();

DROP TRIGGER IF EXISTS ledger_snapshots_no_delete ON ledger_snapshots;
CREATE TRIGGER ledger_snapshots_no_delete
  BEFORE DELETE ON ledger_snapshots
  FOR EACH ROW EXECUTE FUNCTION prevent_ledger_snapshots_mutation();

-- 3. period_trial_balance: block UPDATE/DELETE when linked close_session is certified
CREATE OR REPLACE FUNCTION prevent_certified_period_tb_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM close_sessions cs
    WHERE cs.tenant_id = OLD.tenant_id
      AND to_char(cs.period_start, 'YYYY-MM') = OLD.period_label
      AND cs.status = 'certified'
  ) THEN
    RAISE EXCEPTION 'period_trial_balance is immutable when linked close_session is certified: % operations are prohibited', TG_OP;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RETURN NEW;
  ELSE
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS period_trial_balance_no_update_when_certified ON period_trial_balance;
CREATE TRIGGER period_trial_balance_no_update_when_certified
  BEFORE UPDATE ON period_trial_balance
  FOR EACH ROW EXECUTE FUNCTION prevent_certified_period_tb_mutation();

DROP TRIGGER IF EXISTS period_trial_balance_no_delete_when_certified ON period_trial_balance;
CREATE TRIGGER period_trial_balance_no_delete_when_certified
  BEFORE DELETE ON period_trial_balance
  FOR EACH ROW EXECUTE FUNCTION prevent_certified_period_tb_mutation();
