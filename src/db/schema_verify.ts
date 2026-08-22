/**
 * Schema verification: required tables and columns for backend + integration tests.
 * Used after reset+migrate and in CI before running integration tests.
 * No production runtime behavior; tooling only.
 */

import type { Pool } from 'pg';

export interface VerifyResult {
  ok: boolean;
  errors: string[];
}

/** Required table + schema + columns. Post-093: core/ai/audit; pre-093: public. */
const REQUIRED: Array<{ table: string; schema: string; columns: string[] }> = [
  { table: 'audit_ledger', schema: 'audit', columns: ['id', 'tenant_id', 'previous_entry_hash', 'entry_hash', 'event_type'] },
  { table: 'tenant_hitl_staging', schema: 'ai', columns: ['id', 'tenant_id', 'status', 'payload'] },
  { table: 'period_trial_balance', schema: 'core', columns: ['tenant_id', 'period_label', 'entries'] },
  { table: 'journal_entries', schema: 'core', columns: ['id', 'tenant_id', 'close_session_id', 'status'] },
  { table: 'journal_entry_lines', schema: 'core', columns: ['je_id', 'line_index', 'debit', 'credit', 'amount_provenance'] },
  { table: 'journal_entry_erp_writebacks', schema: 'core', columns: ['journal_entry_id', 'tenant_id', 'connection_id', 'status', 'idempotency_key', 'external_id'] },
  { table: 'tenant_justifications', schema: 'core', columns: ['id', 'tenant_id', 'period_label', 'related_type', 'related_id'] },
  { table: 'period_locks', schema: 'core', columns: ['tenant_id', 'period_label', 'locked_at'] },
  { table: 'close_sessions', schema: 'core', columns: ['id', 'tenant_id', 'entity_id', 'period_start', 'period_end', 'status'] },
  { table: 'schema_migrations', schema: 'public', columns: ['version'] },
  { table: 'tenants', schema: 'public', columns: ['id', 'name', 'database_url'] },
  { table: 'ai_call_log', schema: 'ai', columns: ['id', 'tenant_id', 'pillar', 'prompt_version', 'model', 'ok', 'created_at'] },
  { table: 'tenant_ai_proposals', schema: 'ai', columns: ['id', 'tenant_id', 'period_label', 'proposal', 'created_at'] },
  { table: 'evidence_records', schema: 'core', columns: ['id', 'tenant_id', 'hash_sha256', 'size_bytes', 'attached_by', 'attached_at'] },
  { table: 'evidence_links', schema: 'core', columns: ['id', 'tenant_id', 'evidence_id', 'object_type', 'object_id', 'created_by'] },
  { table: 'close_runbooks', schema: 'core', columns: ['id', 'tenant_id', 'entity_id', 'compiled_plan', 'source_sha256', 'status', 'is_active'] },
  { table: 'close_runbook_executions', schema: 'core', columns: ['id', 'tenant_id', 'runbook_id', 'close_session_id', 'status'] },
  { table: 'close_runbook_task_executions', schema: 'core', columns: ['id', 'tenant_id', 'execution_id', 'task_snapshot', 'status', 'result'] },
  { table: 'accounting_correction_events', schema: 'core', columns: ['id', 'tenant_id', 'entity_id', 'close_session_id', 'original_je_id', 'replacement_je_id'] },
  { table: 'accounting_memories', schema: 'core', columns: ['id', 'tenant_id', 'entity_id', 'framework', 'status', 'pattern_signature', 'subject', 'treatment'] },
  { table: 'accounting_memory_applications', schema: 'core', columns: ['id', 'tenant_id', 'close_session_id', 'memory_id', 'outcome'] },
  { table: 'close_orchestrator_runs', schema: 'core', columns: ['id', 'tenant_id', 'close_session_id', 'status', 'max_depth', 'max_steps', 'steps_used'] },
  { table: 'close_orchestrator_events', schema: 'core', columns: ['id', 'tenant_id', 'run_id', 'parent_event_id', 'depth', 'event_type'] },
  { table: 'close_recovery_incidents', schema: 'core', columns: ['id', 'tenant_id', 'run_id', 'failure_class', 'status', 'attempt_count'] },
];

/**
 * Verify that required tables and columns exist, plus critical constraints/indexes.
 * Returns { ok, errors }; ok is false if any check fails. Caller should exit non-zero on !ok.
 */
export async function verifySchema(pool: Pool): Promise<VerifyResult> {
  const errors: string[] = [];

  for (const { table, schema, columns } of REQUIRED) {
    const tableExists = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
      [schema, table]
    );
    if (tableExists.rows.length === 0) {
      const fallbackSchema = schema === 'public' ? 'core' : 'public';
      const fallback = await pool.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
        [fallbackSchema, table]
      );
      if (fallback.rows.length > 0) {
        continue;
      }
      errors.push(`Table missing: ${schema}.${table} (or public.${table})`);
      continue;
    }

    for (const col of columns) {
      const colExists = await pool.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
        [schema, table, col]
      );
      if (colExists.rows.length === 0) {
        errors.push(`Column missing: ${schema}.${table}.${col}`);
      }
    }
  }

  // audit_ledger: must have an index on entry_hash or (tenant_id, created_at) for hash-chain / sequence
  const auditLedgerIndex = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM pg_indexes WHERE schemaname IN ('audit','public') AND tablename = 'audit_ledger'`
  );
  if (auditLedgerIndex.rows[0] && parseInt(auditLedgerIndex.rows[0].n, 10) < 1) {
    errors.push('audit_ledger: at least one index required (e.g. on entry_hash or tenant_id, created_at)');
  }

  // journal_entry_lines → journal_entries: foreign key must exist
  const jeLinesFk = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n
     FROM information_schema.table_constraints tc
     JOIN information_schema.constraint_column_usage ccu
       ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
     WHERE tc.table_name = 'journal_entry_lines'
       AND tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'journal_entries'`
  );
  if (jeLinesFk.rows[0] && parseInt(jeLinesFk.rows[0].n, 10) < 1) {
    errors.push('journal_entry_lines: foreign key to journal_entries missing');
  }

  const recursiveCloseIndexes = await pool.query<{ indexname: string }>(
    `SELECT indexname
     FROM pg_indexes
     WHERE schemaname = 'core'
       AND indexname = ANY($1::text[])`,
    [['uq_accounting_memory_active_pattern', 'idx_close_recovery_incidents_session']]
  );
  const recursiveIndexNames = new Set(recursiveCloseIndexes.rows.map((row) => row.indexname));
  for (const indexName of ['uq_accounting_memory_active_pattern', 'idx_close_recovery_incidents_session']) {
    if (!recursiveIndexNames.has(indexName)) errors.push(`Critical index missing: core.${indexName}`);
  }

  const recursiveCloseTriggers = await pool.query<{ tgname: string }>(
    `SELECT trigger_row.tgname
     FROM pg_trigger trigger_row
     JOIN pg_class relation ON relation.oid = trigger_row.tgrelid
     JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = 'core' AND NOT trigger_row.tgisinternal
       AND trigger_row.tgname = ANY($1::text[])`,
    [[
      'accounting_correction_events_append_only',
      'accounting_memory_applications_append_only',
      'accounting_memory_payload_immutable',
      'close_orchestrator_events_append_only',
    ]]
  );
  const recursiveTriggerNames = new Set(recursiveCloseTriggers.rows.map((row) => row.tgname));
  for (const triggerName of [
    'accounting_correction_events_append_only',
    'accounting_memory_applications_append_only',
    'accounting_memory_payload_immutable',
    'close_orchestrator_events_append_only',
  ]) {
    if (!recursiveTriggerNames.has(triggerName)) errors.push(`Critical trigger missing: core.${triggerName}`);
  }

  const recursiveCloseConstraints = await pool.query<{ conname: string }>(
    `SELECT constraint_row.conname
     FROM pg_constraint constraint_row
     JOIN pg_class relation ON relation.oid = constraint_row.conrelid
     JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = 'core'
       AND constraint_row.conname = ANY($1::text[])`,
    [[
      'chk_accounting_memory_treatment_guardrails',
      'chk_accounting_memory_reusable_rationale',
      'chk_accounting_memory_terminal_resolution',
      'chk_close_orchestrator_budget',
      'chk_close_recovery_attempts',
    ]]
  );
  const recursiveConstraintNames = new Set(recursiveCloseConstraints.rows.map((row) => row.conname));
  for (const constraintName of [
    'chk_accounting_memory_treatment_guardrails',
    'chk_accounting_memory_reusable_rationale',
    'chk_accounting_memory_terminal_resolution',
    'chk_close_orchestrator_budget',
    'chk_close_recovery_attempts',
  ]) {
    if (!recursiveConstraintNames.has(constraintName)) errors.push(`Critical constraint missing: core.${constraintName}`);
  }

  const recursiveCloseRls = await pool.query<{ relname: string }>(
    `SELECT relation.relname
     FROM pg_class relation
     JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = 'core' AND relation.relrowsecurity
       AND relation.relname = ANY($1::text[])`,
    [[
      'accounting_correction_events',
      'accounting_memories',
      'accounting_memory_applications',
      'close_orchestrator_runs',
      'close_orchestrator_events',
      'close_recovery_incidents',
    ]]
  );
  if (recursiveCloseRls.rows.length !== 6) {
    errors.push('Recursive close memory: row-level security must be enabled on all six governed tables');
  }

  return { ok: errors.length === 0, errors };
}
