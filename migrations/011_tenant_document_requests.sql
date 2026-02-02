-- Document request list (DRL) — tenant schema.

CREATE TABLE IF NOT EXISTS document_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  request_label TEXT NOT NULL,
  document_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fulfilled_at TIMESTAMPTZ,
  assignee TEXT,
  due_date DATE
);

CREATE INDEX IF NOT EXISTS idx_document_requests_tenant ON document_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_document_requests_status ON document_requests(tenant_id, status);
