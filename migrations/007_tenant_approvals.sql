-- Approval workflow defs, steps, requests, events (tenant schema).

CREATE TABLE IF NOT EXISTS approval_workflow_defs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_workflow_tenant ON approval_workflow_defs(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_approval_workflow_resource ON approval_workflow_defs(tenant_id, resource_type);

CREATE TABLE IF NOT EXISTS approval_workflow_steps (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES approval_workflow_defs(id) ON DELETE CASCADE,
  "order" INTEGER NOT NULL,
  required_role TEXT NOT NULL,
  named_approver TEXT
);

CREATE INDEX IF NOT EXISTS idx_approval_steps_workflow ON approval_workflow_steps(workflow_id);

CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  current_step_index INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_tenant ON approval_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_resource ON approval_requests(tenant_id, resource_type, resource_id);

CREATE TABLE IF NOT EXISTS approval_request_events (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  comment TEXT
);

CREATE INDEX IF NOT EXISTS idx_approval_events_request ON approval_request_events(request_id);
