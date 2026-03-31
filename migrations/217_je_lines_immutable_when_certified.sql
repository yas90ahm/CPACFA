-- Prevent UPDATE or DELETE on journal_entry_lines when the linked close session
-- is in certified or locked state. Defense-in-depth: the application layer already
-- blocks this, but the trigger enforces it at the database level.

CREATE OR REPLACE FUNCTION prevent_je_line_mutation_when_certified()
RETURNS TRIGGER AS $$
DECLARE
  session_status TEXT;
BEGIN
  SELECT cs.status INTO session_status
  FROM journal_entries je
  JOIN close_sessions cs ON cs.id = je.close_session_id
  WHERE je.id = OLD.journal_entry_id
  LIMIT 1;

  IF session_status IN ('certified', 'locked') THEN
    RAISE EXCEPTION 'Cannot modify journal entry lines: close session is %', session_status;
  END IF;

  -- For UPDATE return NEW, for DELETE return OLD
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop if exists for idempotency, then create
DROP TRIGGER IF EXISTS je_lines_immutable_when_certified ON journal_entry_lines;

CREATE TRIGGER je_lines_immutable_when_certified
  BEFORE UPDATE OR DELETE ON journal_entry_lines
  FOR EACH ROW EXECUTE FUNCTION prevent_je_line_mutation_when_certified();
