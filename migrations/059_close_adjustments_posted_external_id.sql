-- Add posted_external_id to close_adjustments (GL reference after push).
ALTER TABLE close_adjustments ADD COLUMN IF NOT EXISTS posted_external_id TEXT;
