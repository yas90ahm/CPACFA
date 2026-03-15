-- Extend JE immutability triggers to also protect 'exported' status.
-- Previously only 'posted' was protected; now both 'posted' and 'exported' are immutable.

-- 1. Replace the JE-level immutability function
CREATE OR REPLACE FUNCTION prevent_posted_je_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('posted', 'exported') THEN
    RAISE EXCEPTION
      'Posted/exported journal entries are immutable. Entry ID: %, status: %',
      OLD.id, OLD.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Re-create triggers with updated WHEN clauses covering both statuses
DROP TRIGGER IF EXISTS je_immutable_after_post ON journal_entries;
CREATE TRIGGER je_immutable_after_post
  BEFORE UPDATE ON journal_entries
  FOR EACH ROW
  WHEN (OLD.status IN ('posted', 'exported'))
  EXECUTE FUNCTION prevent_posted_je_modification();

DROP TRIGGER IF EXISTS je_no_delete_after_post ON journal_entries;
CREATE TRIGGER je_no_delete_after_post
  BEFORE DELETE ON journal_entries
  FOR EACH ROW
  WHEN (OLD.status IN ('posted', 'exported'))
  EXECUTE FUNCTION prevent_posted_je_modification();

-- 2. Replace the JE-lines immutability function to protect lines when parent is posted OR exported
CREATE OR REPLACE FUNCTION prevent_posted_je_line_modification()
RETURNS TRIGGER AS $$
DECLARE
  parent_status TEXT;
  je_id_val TEXT;
BEGIN
  je_id_val := COALESCE(OLD.je_id, NEW.je_id);
  SELECT status INTO parent_status
  FROM journal_entries
  WHERE id = je_id_val;

  IF parent_status IN ('posted', 'exported') THEN
    RAISE EXCEPTION
      'Lines of posted/exported journal entries are immutable. Entry ID: %, status: %',
      je_id_val, parent_status;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS je_lines_immutable_after_post ON journal_entry_lines;
CREATE TRIGGER je_lines_immutable_after_post
  BEFORE UPDATE OR DELETE ON journal_entry_lines
  FOR EACH ROW
  EXECUTE FUNCTION prevent_posted_je_line_modification();
