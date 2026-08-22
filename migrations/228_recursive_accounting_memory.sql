-- Governed accounting memory and bounded close-orchestration recovery.
-- Human corrections are immutable facts. Reusable treatments are versioned,
-- entity scoped, and never contain an amount that may be copied to a later period.

CREATE TABLE IF NOT EXISTS core.accounting_correction_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  close_session_id TEXT NOT NULL REFERENCES core.close_sessions(id) ON DELETE RESTRICT,
  period_label TEXT NOT NULL,
  framework TEXT NOT NULL,
  correction_type TEXT NOT NULL DEFAULT 'journal_entry',
  original_je_id TEXT NOT NULL REFERENCES core.journal_entries(id) ON DELETE RESTRICT,
  replacement_je_id TEXT NOT NULL REFERENCES core.journal_entries(id) ON DELETE RESTRICT,
  before_snapshot JSONB NOT NULL,
  after_snapshot JSONB NOT NULL,
  rationale TEXT NOT NULL,
  applicability TEXT NOT NULL,
  memory_scope TEXT NOT NULL,
  corrected_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_accounting_correction_framework CHECK (framework = 'ASPE'),
  CONSTRAINT chk_accounting_correction_type CHECK (correction_type = 'journal_entry'),
  CONSTRAINT chk_accounting_correction_applicability CHECK (
    applicability IN ('one_time', 'recurring', 'policy_candidate')
  ),
  CONSTRAINT chk_accounting_correction_scope CHECK (
    memory_scope IN ('transaction_pattern', 'account', 'entity')
  ),
  CONSTRAINT chk_accounting_correction_rationale CHECK (length(trim(rationale)) >= 10),
  CONSTRAINT chk_accounting_correction_period CHECK (
    period_label ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
  ),
  CONSTRAINT chk_accounting_correction_distinct_je CHECK (original_je_id <> replacement_je_id),
  CONSTRAINT uq_accounting_correction_original UNIQUE (tenant_id, original_je_id),
  CONSTRAINT uq_accounting_correction_replacement UNIQUE (tenant_id, replacement_je_id)
);

CREATE INDEX IF NOT EXISTS idx_accounting_corrections_session
  ON core.accounting_correction_events(tenant_id, close_session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_accounting_corrections_entity
  ON core.accounting_correction_events(tenant_id, entity_id, framework, created_at DESC);

CREATE TABLE IF NOT EXISTS core.accounting_memories (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  framework TEXT NOT NULL,
  memory_type TEXT NOT NULL DEFAULT 'journal_treatment',
  status TEXT NOT NULL,
  pattern_signature TEXT NOT NULL,
  subject JSONB NOT NULL,
  treatment JSONB NOT NULL,
  rationale TEXT NOT NULL,
  applicability TEXT NOT NULL,
  memory_scope TEXT NOT NULL,
  effective_from_period TEXT NOT NULL,
  effective_to_period TEXT,
  source_correction_event_id TEXT NOT NULL
    REFERENCES core.accounting_correction_events(id) ON DELETE RESTRICT,
  supersedes_memory_id TEXT REFERENCES core.accounting_memories(id) ON DELETE RESTRICT,
  conflicts_with_memory_id TEXT REFERENCES core.accounting_memories(id) ON DELETE RESTRICT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  resolution_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_accounting_memory_framework CHECK (framework = 'ASPE'),
  CONSTRAINT chk_accounting_memory_type CHECK (memory_type = 'journal_treatment'),
  CONSTRAINT chk_accounting_memory_status CHECK (
    status IN ('candidate', 'approved', 'superseded', 'revoked')
  ),
  CONSTRAINT chk_accounting_memory_applicability CHECK (
    applicability IN ('one_time', 'recurring', 'policy_candidate')
  ),
  CONSTRAINT chk_accounting_memory_scope CHECK (
    memory_scope IN ('transaction_pattern', 'account', 'entity')
  ),
  CONSTRAINT chk_accounting_memory_approved_identity CHECK (
    status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
  ),
  CONSTRAINT chk_accounting_memory_terminal_resolution CHECK (
    status NOT IN ('superseded', 'revoked') OR (
      resolved_by IS NOT NULL
      AND resolved_at IS NOT NULL
      AND length(trim(COALESCE(resolution_reason, ''))) >= 10
    )
  ),
  CONSTRAINT chk_accounting_memory_periods CHECK (
    effective_from_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      AND (effective_to_period IS NULL OR (
        effective_to_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
          AND effective_to_period >= effective_from_period
      ))
  ),
  CONSTRAINT chk_accounting_memory_reusable_rationale CHECK (rationale !~ '[0-9]'),
  CONSTRAINT chk_accounting_memory_treatment_guardrails CHECK (
    treatment @> '{"amountPolicy":"recalculate_from_current_period_source","requiresCurrentPeriodEvidence":true,"reusableAmountsStored":false}'::jsonb
      AND COALESCE(treatment->>'correctedMemo', '') !~ '[0-9]'
      AND NOT jsonb_path_exists(treatment, '$.**.debit')
      AND NOT jsonb_path_exists(treatment, '$.**.credit')
      AND NOT jsonb_path_exists(treatment, '$.**.amount')
  ),
  CONSTRAINT uq_accounting_memory_source UNIQUE (source_correction_event_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_memory_active_pattern
  ON core.accounting_memories(tenant_id, entity_id, framework, pattern_signature)
  WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS idx_accounting_memory_lookup
  ON core.accounting_memories(tenant_id, entity_id, framework, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_accounting_memory_candidates
  ON core.accounting_memories(tenant_id, entity_id, status, created_at DESC)
  WHERE status = 'candidate';

CREATE TABLE IF NOT EXISTS core.accounting_memory_applications (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  close_session_id TEXT NOT NULL REFERENCES core.close_sessions(id) ON DELETE RESTRICT,
  memory_id TEXT NOT NULL REFERENCES core.accounting_memories(id) ON DELETE RESTRICT,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  task_execution_id TEXT REFERENCES core.close_runbook_task_executions(id) ON DELETE RESTRICT,
  outcome TEXT NOT NULL,
  similarity NUMERIC(5,4) NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}',
  applied_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_memory_application_target CHECK (
    target_type IN ('journal_entry', 'runbook_task', 'close_session')
  ),
  CONSTRAINT chk_memory_application_outcome CHECK (
    outcome IN ('context_supplied', 'consistent', 'conflict_blocked', 'suggested', 'accepted', 'rejected')
  ),
  CONSTRAINT chk_memory_application_similarity CHECK (similarity >= 0 AND similarity <= 1),
  CONSTRAINT uq_memory_application_once UNIQUE (
    tenant_id, close_session_id, memory_id, target_type, target_id, outcome
  )
);

CREATE INDEX IF NOT EXISTS idx_memory_applications_session
  ON core.accounting_memory_applications(tenant_id, close_session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS core.close_orchestrator_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  close_session_id TEXT NOT NULL REFERENCES core.close_sessions(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active',
  max_depth INTEGER NOT NULL DEFAULT 3,
  max_steps INTEGER NOT NULL DEFAULT 25,
  steps_used INTEGER NOT NULL DEFAULT 0,
  memory_context_count INTEGER NOT NULL DEFAULT 0,
  stop_reason TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_close_orchestrator_status CHECK (
    status IN ('active', 'waiting_human', 'completed', 'stopped')
  ),
  CONSTRAINT chk_close_orchestrator_budget CHECK (
    max_depth BETWEEN 1 AND 5 AND max_steps BETWEEN 1 AND 100
      AND steps_used >= 0 AND steps_used <= max_steps
      AND memory_context_count >= 0
  ),
  CONSTRAINT uq_close_orchestrator_session UNIQUE (tenant_id, close_session_id)
);

CREATE INDEX IF NOT EXISTS idx_close_orchestrator_runs_status
  ON core.close_orchestrator_runs(tenant_id, status, updated_at);

CREATE TABLE IF NOT EXISTS core.close_orchestrator_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES core.close_orchestrator_runs(id) ON DELETE RESTRICT,
  close_session_id TEXT NOT NULL REFERENCES core.close_sessions(id) ON DELETE RESTRICT,
  parent_event_id TEXT REFERENCES core.close_orchestrator_events(id) ON DELETE RESTRICT,
  depth INTEGER NOT NULL DEFAULT 0,
  event_type TEXT NOT NULL,
  source_type TEXT,
  source_id TEXT,
  decision JSONB NOT NULL DEFAULT '{}',
  actor TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_close_orchestrator_event_depth CHECK (depth BETWEEN 0 AND 5),
  CONSTRAINT chk_close_orchestrator_event_type CHECK (
    event_type IN (
      'close_started', 'human_correction', 'journal_entry_changed', 'task_blocked', 'task_failed',
      'memory_applied', 'recovery_scheduled', 'recovery_completed',
      'human_required', 'budget_stopped'
    )
  ),
  CONSTRAINT chk_close_orchestrator_source CHECK (
    source_type IS NULL OR source_type IN ('close_session', 'journal_entry', 'runbook_task', 'memory', 'job')
  )
);

CREATE INDEX IF NOT EXISTS idx_close_orchestrator_events_run
  ON core.close_orchestrator_events(tenant_id, run_id, created_at);

CREATE TABLE IF NOT EXISTS core.close_recovery_incidents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES core.close_orchestrator_runs(id) ON DELETE RESTRICT,
  close_session_id TEXT NOT NULL REFERENCES core.close_sessions(id) ON DELETE RESTRICT,
  task_execution_id TEXT REFERENCES core.close_runbook_task_executions(id) ON DELETE RESTRICT,
  failure_class TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  auto_recoverable BOOLEAN NOT NULL DEFAULT FALSE,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 2,
  error_fingerprint TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}',
  resolution JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  CONSTRAINT chk_close_recovery_failure_class CHECK (
    failure_class IN (
      'transient_operational', 'missing_input', 'accounting_exception',
      'control_failure', 'ambiguous_external_write', 'human_correction_required'
    )
  ),
  CONSTRAINT chk_close_recovery_status CHECK (
    status IN ('open', 'retry_scheduled', 'resolved', 'human_required', 'stopped')
  ),
  CONSTRAINT chk_close_recovery_attempts CHECK (
    attempt_count >= 0 AND max_attempts BETWEEN 0 AND 5 AND attempt_count <= max_attempts
  ),
  CONSTRAINT uq_close_recovery_open_failure UNIQUE (
    tenant_id, close_session_id, error_fingerprint
  )
);

CREATE INDEX IF NOT EXISTS idx_close_recovery_incidents_session
  ON core.close_recovery_incidents(tenant_id, close_session_id, status, updated_at DESC);

ALTER TABLE core.accounting_correction_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.accounting_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.accounting_memory_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.close_orchestrator_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.close_orchestrator_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.close_recovery_incidents ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'accounting_correction_events',
    'accounting_memories',
    'accounting_memory_applications',
    'close_orchestrator_runs',
    'close_orchestrator_events',
    'close_recovery_incidents'
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

CREATE OR REPLACE FUNCTION core.prevent_accounting_learning_fact_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only and cannot be updated or deleted', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS accounting_correction_events_append_only ON core.accounting_correction_events;
CREATE TRIGGER accounting_correction_events_append_only
  BEFORE UPDATE OR DELETE ON core.accounting_correction_events
  FOR EACH ROW EXECUTE FUNCTION core.prevent_accounting_learning_fact_mutation();

DROP TRIGGER IF EXISTS accounting_memory_applications_append_only ON core.accounting_memory_applications;
CREATE TRIGGER accounting_memory_applications_append_only
  BEFORE UPDATE OR DELETE ON core.accounting_memory_applications
  FOR EACH ROW EXECUTE FUNCTION core.prevent_accounting_learning_fact_mutation();

DROP TRIGGER IF EXISTS close_orchestrator_events_append_only ON core.close_orchestrator_events;
CREATE TRIGGER close_orchestrator_events_append_only
  BEFORE UPDATE OR DELETE ON core.close_orchestrator_events
  FOR EACH ROW EXECUTE FUNCTION core.prevent_accounting_learning_fact_mutation();

CREATE OR REPLACE FUNCTION core.prevent_accounting_memory_payload_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Accounting memories cannot be deleted; revoke or supersede them';
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR
     NEW.entity_id IS DISTINCT FROM OLD.entity_id OR
     NEW.framework IS DISTINCT FROM OLD.framework OR
     NEW.memory_type IS DISTINCT FROM OLD.memory_type OR
     NEW.pattern_signature IS DISTINCT FROM OLD.pattern_signature OR
     NEW.subject IS DISTINCT FROM OLD.subject OR
     NEW.treatment IS DISTINCT FROM OLD.treatment OR
     NEW.rationale IS DISTINCT FROM OLD.rationale OR
     NEW.applicability IS DISTINCT FROM OLD.applicability OR
     NEW.memory_scope IS DISTINCT FROM OLD.memory_scope OR
     NEW.effective_from_period IS DISTINCT FROM OLD.effective_from_period OR
     NEW.source_correction_event_id IS DISTINCT FROM OLD.source_correction_event_id OR
     NEW.supersedes_memory_id IS DISTINCT FROM OLD.supersedes_memory_id OR
     NEW.conflicts_with_memory_id IS DISTINCT FROM OLD.conflicts_with_memory_id OR
     NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Accounting memory facts are immutable; create a superseding memory';
  END IF;
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    IF NEW.effective_to_period IS DISTINCT FROM OLD.effective_to_period OR
       NEW.approved_by IS DISTINCT FROM OLD.approved_by OR
       NEW.approved_at IS DISTINCT FROM OLD.approved_at OR
       NEW.resolved_by IS DISTINCT FROM OLD.resolved_by OR
       NEW.resolved_at IS DISTINCT FROM OLD.resolved_at OR
       NEW.resolution_reason IS DISTINCT FROM OLD.resolution_reason THEN
      RAISE EXCEPTION 'Accounting memory lifecycle fields may change only during a governed status transition';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT (
    (OLD.status = 'candidate' AND NEW.status IN ('approved', 'revoked')) OR
    (OLD.status = 'approved' AND NEW.status IN ('superseded', 'revoked'))
  ) THEN
    RAISE EXCEPTION 'Invalid accounting memory status transition: % to %', OLD.status, NEW.status;
  END IF;
  IF OLD.status = 'approved' AND (
    NEW.approved_by IS DISTINCT FROM OLD.approved_by OR
    NEW.approved_at IS DISTINCT FROM OLD.approved_at
  ) THEN
    RAISE EXCEPTION 'Accounting memory approval identity is immutable';
  END IF;
  IF NEW.effective_to_period IS DISTINCT FROM OLD.effective_to_period AND NOT (
    OLD.status = 'approved' AND NEW.status = 'superseded'
  ) THEN
    RAISE EXCEPTION 'Effective end period may be set only when an approved memory is superseded';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS accounting_memory_payload_immutable ON core.accounting_memories;
CREATE TRIGGER accounting_memory_payload_immutable
  BEFORE UPDATE OR DELETE ON core.accounting_memories
  FOR EACH ROW EXECUTE FUNCTION core.prevent_accounting_memory_payload_mutation();
