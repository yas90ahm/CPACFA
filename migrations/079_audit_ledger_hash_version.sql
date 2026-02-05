-- Audit ledger hash version: v1 = raw (legacy), v2 = canonical (sorted keys + normalized dates).
-- Existing rows get DEFAULT 1; new entries insert with hash_version = 2.

ALTER TABLE audit_ledger
  ADD COLUMN IF NOT EXISTS hash_version SMALLINT NOT NULL DEFAULT 1;

COMMENT ON COLUMN audit_ledger.hash_version IS '1=raw hash (legacy), 2=canonical hash (sorted keys, normalized dates)';
