-- Migration 134: GL upload history for duplicate detection
-- Stores SHA-256 hash of each uploaded GL file to prevent accidental re-uploads.

CREATE TABLE IF NOT EXISTS gl_upload_history (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  period_label TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  uploaded_by TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  row_count INTEGER
);

CREATE INDEX IF NOT EXISTS idx_gl_upload_history_lookup
  ON gl_upload_history (tenant_id, period_label, file_hash);
