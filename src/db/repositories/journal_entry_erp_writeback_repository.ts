import type { Pool } from 'pg';

export type ErpWritebackStatus =
  | 'pending'
  | 'posting'
  | 'posted'
  | 'failed'
  | 'reconciliation_required'
  | 'cancelled';

export interface JournalEntryErpWriteback {
  journalEntryId: string;
  tenantId: string;
  connectionId: string;
  status: ErpWritebackStatus;
  idempotencyKey: string;
  requestedBy: string;
  requestedAt: string;
  postingStartedAt?: string;
  externalId?: string;
  externalRef?: string;
  postedAt?: string;
  lastError?: string;
  updatedAt: string;
}

interface WritebackDbRow {
  journal_entry_id: string;
  tenant_id: string;
  connection_id: string;
  status: string;
  idempotency_key: string;
  requested_by: string;
  requested_at: string | Date;
  posting_started_at: string | Date | null;
  external_id: string | null;
  external_ref: string | null;
  posted_at: string | Date | null;
  last_error: string | null;
  updated_at: string | Date;
}

const COLUMNS = `journal_entry_id, tenant_id, connection_id, status, idempotency_key,
  requested_by, requested_at, posting_started_at, external_id, external_ref,
  posted_at, last_error, updated_at`;

function timestamp(value: string | Date): string {
  return typeof value === 'string' ? value : value.toISOString();
}

function rowToWriteback(row: WritebackDbRow): JournalEntryErpWriteback {
  return {
    journalEntryId: row.journal_entry_id,
    tenantId: row.tenant_id,
    connectionId: row.connection_id,
    status: row.status as ErpWritebackStatus,
    idempotencyKey: row.idempotency_key,
    requestedBy: row.requested_by,
    requestedAt: timestamp(row.requested_at),
    postingStartedAt: row.posting_started_at ? timestamp(row.posting_started_at) : undefined,
    externalId: row.external_id ?? undefined,
    externalRef: row.external_ref ?? undefined,
    postedAt: row.posted_at ? timestamp(row.posted_at) : undefined,
    lastError: row.last_error ?? undefined,
    updatedAt: timestamp(row.updated_at),
  };
}

export async function getWriteback(
  pool: Pool,
  tenantId: string,
  journalEntryId: string
): Promise<JournalEntryErpWriteback | null> {
  const result = await pool.query<WritebackDbRow>(
    `SELECT ${COLUMNS}
     FROM journal_entry_erp_writebacks
     WHERE tenant_id = $1 AND journal_entry_id = $2`,
    [tenantId, journalEntryId]
  );
  return result.rows[0] ? rowToWriteback(result.rows[0]) : null;
}

export async function createPendingWriteback(
  pool: Pool,
  input: {
    tenantId: string;
    journalEntryId: string;
    connectionId: string;
    idempotencyKey: string;
    requestedBy: string;
  }
): Promise<JournalEntryErpWriteback> {
  await pool.query(
    `INSERT INTO journal_entry_erp_writebacks (
       journal_entry_id, tenant_id, connection_id, status, idempotency_key, requested_by
     ) VALUES ($1, $2, $3, 'pending', $4, $5)
     ON CONFLICT (journal_entry_id) DO NOTHING`,
    [
      input.journalEntryId,
      input.tenantId,
      input.connectionId,
      input.idempotencyKey,
      input.requestedBy,
    ]
  );
  const row = await getWriteback(pool, input.tenantId, input.journalEntryId);
  if (!row) throw new Error('ERP writeback request was not persisted');
  return row;
}

export async function listPendingWritebacks(
  pool: Pool,
  tenantId: string,
  limit: number = 100
): Promise<JournalEntryErpWriteback[]> {
  const result = await pool.query<WritebackDbRow>(
    `SELECT ${COLUMNS}
     FROM journal_entry_erp_writebacks
     WHERE tenant_id = $1 AND status = 'pending'
     ORDER BY requested_at
     LIMIT $2`,
    [tenantId, limit]
  );
  return result.rows.map(rowToWriteback);
}

export async function beginPosting(
  pool: Pool,
  tenantId: string,
  journalEntryId: string
): Promise<JournalEntryErpWriteback | null> {
  const result = await pool.query<WritebackDbRow>(
    `UPDATE journal_entry_erp_writebacks
     SET status = 'posting', posting_started_at = NOW(), last_error = NULL, updated_at = NOW()
     WHERE tenant_id = $1 AND journal_entry_id = $2 AND status = 'pending'
     RETURNING ${COLUMNS}`,
    [tenantId, journalEntryId]
  );
  return result.rows[0] ? rowToWriteback(result.rows[0]) : null;
}

export async function markPosted(
  pool: Pool,
  tenantId: string,
  journalEntryId: string,
  result: { externalId?: string; externalRef?: string }
): Promise<JournalEntryErpWriteback | null> {
  const updated = await pool.query<WritebackDbRow>(
    `UPDATE journal_entry_erp_writebacks
     SET status = 'posted', external_id = $3, external_ref = $4,
         posted_at = NOW(), last_error = NULL, updated_at = NOW()
     WHERE tenant_id = $1 AND journal_entry_id = $2 AND status = 'posting'
     RETURNING ${COLUMNS}`,
    [tenantId, journalEntryId, result.externalId ?? null, result.externalRef ?? null]
  );
  return updated.rows[0] ? rowToWriteback(updated.rows[0]) : null;
}

export async function markTerminal(
  pool: Pool,
  tenantId: string,
  journalEntryId: string,
  status: Extract<ErpWritebackStatus, 'failed' | 'reconciliation_required' | 'cancelled'>,
  error: string
): Promise<JournalEntryErpWriteback | null> {
  const result = await pool.query<WritebackDbRow>(
    `UPDATE journal_entry_erp_writebacks
     SET status = $3, last_error = $4, updated_at = NOW()
     WHERE tenant_id = $1 AND journal_entry_id = $2
       AND status IN ('pending', 'posting')
     RETURNING ${COLUMNS}`,
    [tenantId, journalEntryId, status, error]
  );
  return result.rows[0] ? rowToWriteback(result.rows[0]) : null;
}
