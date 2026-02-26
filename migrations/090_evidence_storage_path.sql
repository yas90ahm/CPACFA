-- Add storage_path and original_filename for evidence file persistence.
-- Evidence files are stored via evidence_storage_service (local or S3).

ALTER TABLE evidence_records
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS original_filename TEXT;
