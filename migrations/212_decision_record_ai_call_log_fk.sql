-- Decision record FK to ai_call_log for deterministic audit trail reconstruction.
-- Replaces timestamp-based correlation with explicit linkage.

ALTER TABLE decision_records
  ADD COLUMN IF NOT EXISTS ai_call_log_id UUID NULL;
