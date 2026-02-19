-- Prevent modification/deletion of journal entry lines when the parent entry is posted.

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

  IF parent_status = 'posted' THEN
    RAISE EXCEPTION
      'Lines of posted journal entries are immutable. Entry ID: %',
      je_id_val;
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
