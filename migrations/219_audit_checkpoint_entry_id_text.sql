-- Audit ledger entry IDs use the "al-<timestamp>-<random>" text format.
-- Keep checkpoint references compatible with the audit_ledger.id TEXT column.

ALTER TABLE IF EXISTS audit_chain_checkpoints
  ALTER COLUMN last_verified_entry_id TYPE TEXT
  USING last_verified_entry_id::TEXT;
