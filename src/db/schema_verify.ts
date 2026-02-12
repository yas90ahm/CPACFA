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
  { table: 'tenant_justifications', schema: 'core', columns: ['id', 'tenant_id', 'period_label', 'related_type', 'related_id'] },
  { table: 'period_locks', schema: 'core', columns: ['tenant_id', 'period_label', 'locked_at'] },
  { table: 'close_sessions', schema: 'core', columns: ['id', 'tenant_id', 'entity_id', 'period_start', 'period_end', 'status'] },
  { table: 'schema_migrations', schema: 'public', columns: ['version'] },
  { table: 'tenants', schema: 'public', columns: ['id', 'name', 'database_url'] },
  { table: 'ai_call_log', schema: 'ai', columns: ['id', 'tenant_id', 'pillar', 'prompt_version', 'model', 'ok', 'created_at'] },
  { table: 'tenant_ai_proposals', schema: 'ai', columns: ['id', 'tenant_id', 'period_label', 'proposal', 'created_at'] },
  { table: 'evidence_records', schema: 'core', columns: ['id', 'tenant_id', 'hash_sha256', 'size_bytes', 'attached_by', 'attached_at'] },
  { table: 'evidence_links', schema: 'core', columns: ['id', 'tenant_id', 'evidence_id', 'object_type', 'object_id', 'created_by'] },
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
      const fallback = await pool.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
        [table]
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

  return { ok: errors.length === 0, errors };
}
