-- Governed company runbooks compiled into bounded close-agent execution graphs.
-- Uploaded source and approved plans are immutable. The source document is data,
-- never an authority grant: executable capabilities remain code-owned.

-- Close-scoped model provenance. Historical rows remain tenant-scoped with NULL;
-- new close-agent/classification calls persist the owning session explicitly.
ALTER TABLE ai.ai_call_log
  ADD COLUMN IF NOT EXISTS close_session_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'ai.ai_call_log'::regclass
      AND conname = 'fk_ai_call_log_close_session'
  ) THEN
    ALTER TABLE ai.ai_call_log
      ADD CONSTRAINT fk_ai_call_log_close_session
      FOREIGN KEY (close_session_id) REFERENCES core.close_sessions(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ai_call_log_close_session
  ON ai.ai_call_log(tenant_id, close_session_id, created_at DESC)
  WHERE close_session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS core.close_runbooks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  name TEXT NOT NULL,
  version INTEGER NOT NULL,
  framework TEXT NOT NULL DEFAULT 'ASPE',
  frequency TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  source_filename TEXT NOT NULL,
  source_format TEXT NOT NULL,
  source_mime_type TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  source_content BYTEA NOT NULL,
  source_size_bytes INTEGER NOT NULL,
  source_row_count INTEGER NOT NULL,
  compiled_plan JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  supersedes_runbook_id TEXT REFERENCES core.close_runbooks(id),
  CONSTRAINT chk_close_runbook_version CHECK (version > 0),
  CONSTRAINT chk_close_runbook_framework CHECK (framework IN ('ASPE')),
  CONSTRAINT chk_close_runbook_frequency CHECK (frequency IN ('monthly', 'quarterly')),
  CONSTRAINT chk_close_runbook_source_format CHECK (source_format IN ('csv', 'xlsx', 'json', 'text', 'pdf', 'docx')),
  CONSTRAINT chk_close_runbook_status CHECK (status IN ('draft', 'approved', 'archived')),
  CONSTRAINT chk_close_runbook_active_approved CHECK (is_active = FALSE OR status = 'approved'),
  CONSTRAINT chk_close_runbook_source_size CHECK (source_size_bytes >= 0 AND source_size_bytes <= 10485760),
  CONSTRAINT uq_close_runbook_version UNIQUE (tenant_id, entity_id, name, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_close_runbook_active_scope
  ON core.close_runbooks(tenant_id, entity_id, framework, frequency)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_close_runbooks_tenant_entity
  ON core.close_runbooks(tenant_id, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS core.close_runbook_executions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  runbook_id TEXT NOT NULL REFERENCES core.close_runbooks(id),
  close_session_id TEXT NOT NULL REFERENCES core.close_sessions(id),
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_close_runbook_execution_status CHECK (
    status IN ('pending', 'running', 'blocked', 'completed', 'failed', 'cancelled')
  ),
  CONSTRAINT uq_close_runbook_execution_session UNIQUE (tenant_id, close_session_id)
);

CREATE INDEX IF NOT EXISTS idx_close_runbook_executions_status
  ON core.close_runbook_executions(tenant_id, status, updated_at);

CREATE TABLE IF NOT EXISTS core.close_runbook_task_executions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  execution_id TEXT NOT NULL REFERENCES core.close_runbook_executions(id),
  close_session_id TEXT NOT NULL REFERENCES core.close_sessions(id),
  task_code TEXT NOT NULL,
  task_snapshot JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  result JSONB,
  blocked_reason TEXT,
  assigned_to TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_close_runbook_task_status CHECK (
    status IN ('pending', 'queued', 'running', 'waiting_human', 'blocked', 'completed', 'failed', 'skipped')
  ),
  CONSTRAINT uq_close_runbook_task_code UNIQUE (execution_id, task_code)
);

CREATE INDEX IF NOT EXISTS idx_close_runbook_tasks_ready
  ON core.close_runbook_task_executions(tenant_id, execution_id, status, task_code);

ALTER TABLE core.close_runbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.close_runbook_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.close_runbook_task_executions ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'close_runbooks',
    'close_runbook_executions',
    'close_runbook_task_executions'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'core'
        AND tablename = table_name
        AND policyname = 'tenant_isolation_policy'
    ) THEN
      EXECUTE format(
        'CREATE POLICY tenant_isolation_policy ON core.%I
           USING (tenant_id = current_setting(''app.current_tenant_id'', true))
           WITH CHECK (tenant_id = current_setting(''app.current_tenant_id'', true))',
        table_name
      );
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION core.prevent_approved_close_runbook_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.approved_at IS NOT NULL THEN
    RAISE EXCEPTION 'Approved close runbooks are immutable and cannot be deleted. Runbook ID: %', OLD.id;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.approved_at IS NOT NULL AND (
    NEW.status NOT IN ('approved', 'archived') OR
    NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR
    NEW.entity_id IS DISTINCT FROM OLD.entity_id OR
    NEW.name IS DISTINCT FROM OLD.name OR
    NEW.version IS DISTINCT FROM OLD.version OR
    NEW.framework IS DISTINCT FROM OLD.framework OR
    NEW.frequency IS DISTINCT FROM OLD.frequency OR
    NEW.profile_id IS DISTINCT FROM OLD.profile_id OR
    NEW.source_filename IS DISTINCT FROM OLD.source_filename OR
    NEW.source_format IS DISTINCT FROM OLD.source_format OR
    NEW.source_mime_type IS DISTINCT FROM OLD.source_mime_type OR
    NEW.source_sha256 IS DISTINCT FROM OLD.source_sha256 OR
    NEW.source_content IS DISTINCT FROM OLD.source_content OR
    NEW.source_size_bytes IS DISTINCT FROM OLD.source_size_bytes OR
    NEW.source_row_count IS DISTINCT FROM OLD.source_row_count OR
    NEW.compiled_plan IS DISTINCT FROM OLD.compiled_plan OR
    NEW.created_by IS DISTINCT FROM OLD.created_by OR
    NEW.approved_by IS DISTINCT FROM OLD.approved_by OR
    NEW.approved_at IS DISTINCT FROM OLD.approved_at OR
    NEW.supersedes_runbook_id IS DISTINCT FROM OLD.supersedes_runbook_id
  ) THEN
    RAISE EXCEPTION 'Approved close runbook source and compiled plan are immutable. Create a new version instead. Runbook ID: %', OLD.id;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS close_runbook_immutable_after_approval ON core.close_runbooks;
CREATE TRIGGER close_runbook_immutable_after_approval
  BEFORE UPDATE OR DELETE ON core.close_runbooks
  FOR EACH ROW
  EXECUTE FUNCTION core.prevent_approved_close_runbook_mutation();

CREATE OR REPLACE FUNCTION core.prevent_close_runbook_execution_identity_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Close runbook executions are audit records and cannot be deleted. Execution ID: %', OLD.id;
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR
     NEW.runbook_id IS DISTINCT FROM OLD.runbook_id OR
     NEW.close_session_id IS DISTINCT FROM OLD.close_session_id OR
     NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Close runbook execution identity is immutable. Execution ID: %', OLD.id;
  END IF;
  IF OLD.status = 'completed' AND (
     NEW.status IS DISTINCT FROM OLD.status OR
     NEW.started_at IS DISTINCT FROM OLD.started_at OR
     NEW.completed_at IS DISTINCT FROM OLD.completed_at
  ) THEN
    RAISE EXCEPTION 'Completed close runbook executions are immutable. Execution ID: %', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS close_runbook_execution_identity_immutable ON core.close_runbook_executions;
CREATE TRIGGER close_runbook_execution_identity_immutable
  BEFORE UPDATE OR DELETE ON core.close_runbook_executions
  FOR EACH ROW
  EXECUTE FUNCTION core.prevent_close_runbook_execution_identity_mutation();

CREATE OR REPLACE FUNCTION core.prevent_close_runbook_task_identity_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Close runbook task executions are audit records and cannot be deleted. Task execution ID: %', OLD.id;
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR
     NEW.execution_id IS DISTINCT FROM OLD.execution_id OR
     NEW.close_session_id IS DISTINCT FROM OLD.close_session_id OR
     NEW.task_code IS DISTINCT FROM OLD.task_code OR
     NEW.task_snapshot IS DISTINCT FROM OLD.task_snapshot OR
     NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Close runbook task identity and approved snapshot are immutable. Task execution ID: %', OLD.id;
  END IF;
  IF OLD.status IN ('completed', 'skipped') AND (
     NEW.status IS DISTINCT FROM OLD.status OR
     NEW.result IS DISTINCT FROM OLD.result OR
     NEW.blocked_reason IS DISTINCT FROM OLD.blocked_reason OR
     NEW.assigned_to IS DISTINCT FROM OLD.assigned_to OR
     NEW.started_at IS DISTINCT FROM OLD.started_at OR
     NEW.completed_at IS DISTINCT FROM OLD.completed_at OR
     NEW.updated_at IS DISTINCT FROM OLD.updated_at
  ) THEN
    RAISE EXCEPTION 'Completed close runbook task outcomes are immutable. Task execution ID: %', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS close_runbook_task_identity_immutable ON core.close_runbook_task_executions;
CREATE TRIGGER close_runbook_task_identity_immutable
  BEFORE UPDATE OR DELETE ON core.close_runbook_task_executions
  FOR EACH ROW
  EXECUTE FUNCTION core.prevent_close_runbook_task_identity_mutation();
