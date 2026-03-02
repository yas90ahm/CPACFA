-- Migration 131: Database-level balance validation trigger on JE posting
-- Defense-in-depth: validates debits = credits when a JE transitions to 'posted' status.
-- The service layer already checks this, but this trigger prevents bypass via direct SQL.

CREATE OR REPLACE FUNCTION validate_je_balance_before_post()
RETURNS TRIGGER AS $$
DECLARE
  v_total_debit  NUMERIC(20,2);
  v_total_credit NUMERIC(20,2);
BEGIN
  -- Only fire when status transitions TO 'posted'
  IF NEW.status = 'posted' AND (OLD.status IS NULL OR OLD.status != 'posted') THEN
    SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
      INTO v_total_debit, v_total_credit
      FROM journal_entry_lines
     WHERE je_id = NEW.id;

    IF v_total_debit != v_total_credit THEN
      RAISE EXCEPTION 'Cannot post journal entry %: debits (%) != credits (%). Entry must balance.',
        NEW.id, v_total_debit, v_total_credit;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop if exists (idempotent)
DROP TRIGGER IF EXISTS je_balance_check_before_post ON journal_entries;

CREATE TRIGGER je_balance_check_before_post
  BEFORE UPDATE ON journal_entries
  FOR EACH ROW
  WHEN (NEW.status = 'posted')
  EXECUTE FUNCTION validate_je_balance_before_post();
