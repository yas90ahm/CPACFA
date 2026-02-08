-- Evidence Anchoring (Phase 1): proof + reference metadata only.
-- We do NOT store files; evidence stays in external systems (Google Drive/SharePoint/S3/etc).
-- Links evidence to Journal Entries (JE header), not lines.

CREATE TABLE IF NOT EXISTS evidence_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  hash_sha256 TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  mime_type TEXT,
  external_uri TEXT,
  external_provider TEXT,
  label TEXT,
  attached_by TEXT NOT NULL,
  attached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  integrity_version TEXT NOT NULL DEFAULT 'v1'
);

CREATE INDEX IF NOT EXISTS idx_evidence_records_tenant_hash ON evidence_records(tenant_id, hash_sha256);

CREATE TABLE IF NOT EXISTS evidence_links (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT NOT NULL,
  role TEXT,
  requiredness TEXT NOT NULL DEFAULT 'optional',
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_evidence_links_evidence FOREIGN KEY (evidence_id) REFERENCES evidence_records(id) ON DELETE CASCADE,
  CONSTRAINT chk_evidence_links_requiredness CHECK (requiredness IN ('optional', 'required'))
);

CREATE INDEX IF NOT EXISTS idx_evidence_links_tenant_object ON evidence_links(tenant_id, object_type, object_id);
CREATE INDEX IF NOT EXISTS idx_evidence_links_tenant_evidence ON evidence_links(tenant_id, evidence_id);
