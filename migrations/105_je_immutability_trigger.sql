-- Prevent modification of posted journal entries at the database level.
-- Only blocks updates/deletes when status = 'posted'.

CREATE OR REPLACE FUNCTION prevent_posted_je_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'posted' THEN
    RAISE EXCEPTION
      'Posted journal entries are immutable. Entry ID: %, posted at: %',
      OLD.id, OLD.posted_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS je_immutable_after_post ON journal_entries;
CREATE TRIGGER je_immutable_after_post
  BEFORE UPDATE ON journal_entries
  FOR EACH ROW
  WHEN (OLD.status = 'posted')
  EXECUTE FUNCTION prevent_posted_je_modification();

DROP TRIGGER IF EXISTS je_no_delete_after_post ON journal_entries;
CREATE TRIGGER je_no_delete_after_post
  BEFORE DELETE ON journal_entries
  FOR EACH ROW
  WHEN (OLD.status = 'posted')
  EXECUTE FUNCTION prevent_posted_je_modification();
