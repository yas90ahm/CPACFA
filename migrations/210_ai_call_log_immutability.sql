-- ai_call_log immutability: append-only enforcement at DB level
-- Pattern matches audit_ledger triggers (migration 091)

CREATE OR REPLACE FUNCTION prevent_ai_call_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'ai_call_log is append-only — UPDATE and DELETE are not permitted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ai_call_log_no_update ON ai_call_log;
CREATE TRIGGER ai_call_log_no_update
  BEFORE UPDATE ON ai_call_log
  FOR EACH ROW EXECUTE FUNCTION prevent_ai_call_log_mutation();

DROP TRIGGER IF EXISTS ai_call_log_no_delete ON ai_call_log;
CREATE TRIGGER ai_call_log_no_delete
  BEFORE DELETE ON ai_call_log
  FOR EACH ROW EXECUTE FUNCTION prevent_ai_call_log_mutation();

-- Optional FK column linking AI calls to journal entries when contextually relevant
-- Nullable: most AI calls (classification, variance) don't relate to a specific JE
ALTER TABLE ai_call_log
  ADD COLUMN IF NOT EXISTS subject_journal_entry_id TEXT;
