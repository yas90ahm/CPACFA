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

/** Required table + required columns (subset). */
const REQUIRED: Array<{ table: string; columns: string[] }> = [
  { table: 'audit_ledger', columns: ['id', 'tenant_id', 'previous_entry_hash', 'entry_hash', 'event_type'] },
  { table: 'tenant_hitl_staging', columns: ['id', 'tenant_id', 'status', 'payload'] },
  { table: 'period_trial_balance', columns: ['tenant_id', 'period_label', 'entries'] },
  { table: 'journal_entries', columns: ['id', 'tenant_id', 'close_session_id', 'status'] },
  { table: 'journal_entry_lines', columns: ['je_id', 'line_index', 'debit', 'credit'] },
  { table: 'tenant_justifications', columns: ['id', 'tenant_id', 'period_label', 'related_type', 'related_id'] },
  { table: 'period_locks', columns: ['tenant_id', 'period_label', 'locked_at'] },
  { table: 'close_sessions', columns: ['id', 'tenant_id', 'entity_id', 'period_start', 'period_end', 'status'] },
  { table: 'schema_migrations', columns: ['version'] },
  { table: 'tenants', columns: ['id', 'name', 'database_url'] },
  { table: 'ai_call_log', columns: ['id', 'tenant_id', 'pillar', 'prompt_version', 'model', 'ok', 'created_at'] },
  { table: 'tenant_ai_proposals', columns: ['id', 'tenant_id', 'period_label', 'proposal', 'created_at'] },
];

/**
 * Verify that required tables and columns exist, plus critical constraints/indexes.
 * Returns { ok, errors }; ok is false if any check fails. Caller should exit non-zero on !ok.
 */
export async function verifySchema(pool: Pool): Promise<VerifyResult> {
  const errors: string[] = [];

  for (const { table, columns } of REQUIRED) {
    const tableExists = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
      [table]
    );
    if (tableExists.rows.length === 0) {
      errors.push(`Table missing: ${table}`);
      continue;
    }

    for (const col of columns) {
      const colExists = await pool.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
        [table, col]
      );
      if (colExists.rows.length === 0) {
        errors.push(`Column missing: ${table}.${col}`);
      }
    }
  }

  // audit_ledger: must have an index on entry_hash or (tenant_id, created_at) for hash-chain / sequence
  const auditLedgerIndex = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'audit_ledger'`
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
     WHERE tc.table_schema = 'public' AND tc.table_name = 'journal_entry_lines'
       AND tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'journal_entries'`
  );
  if (jeLinesFk.rows[0] && parseInt(jeLinesFk.rows[0].n, 10) < 1) {
    errors.push('journal_entry_lines: foreign key to journal_entries missing');
  }

  return { ok: errors.length === 0, errors };
}
