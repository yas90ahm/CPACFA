/**
 * Journal Entry — DB repository (tenant-scoped).
 * journal_entries, journal_entry_lines, je_attachments.
 */

import type { Pool } from 'pg';
import type {
  JournalEntry,
  JournalEntryLine,
  JournalEntryAttachment,
  JournalEntryStatus,
  JournalEntrySource,
} from '../../types/journal_entry.js';
import type { AmountProvenance } from '../../types/amount_provenance.js';

interface JournalEntryRow {
  id: string;
  close_session_id: string;
  tenant_id: string;
  status: string;
  memo: string | null;
  source: string;
  created_by: string | null;
  approved_by: string | null;
  posted_at: string | null;
  reversal_date: string | null;
  rejection_reason: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
}

interface JournalEntryLineRow {
  je_id: string;
  line_index: number;
  account_ref: string;
  debit: string;
  credit: string;
  description: string | null;
  amount_provenance: unknown;
}

function rowToJE(row: JournalEntryRow): JournalEntry {
  return {
    id: row.id,
    closeSessionId: row.close_session_id,
    tenantId: row.tenant_id,
    status: row.status as JournalEntryStatus,
    memo: row.memo ?? undefined,
    source: row.source as JournalEntrySource,
    createdBy: row.created_by ?? undefined,
    approvedBy: row.approved_by ?? undefined,
    postedAt: row.posted_at ?? undefined,
    reversalDate: row.reversal_date ?? undefined,
    rejectionReason: row.rejection_reason ?? undefined,
    rejectedBy: row.rejected_by ?? undefined,
    rejectedAt: row.rejected_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToLine(row: JournalEntryLineRow): JournalEntryLine {
  return {
    jeId: row.je_id,
    lineIndex: row.line_index,
    accountRef: row.account_ref,
    debit: Number(row.debit),
    credit: Number(row.credit),
    description: row.description ?? undefined,
    amountProvenance:
      row.amount_provenance != null && typeof row.amount_provenance === 'object'
        ? (row.amount_provenance as AmountProvenance)
        : undefined,
  };
}

const JE_COLS = `id, close_session_id, tenant_id, status, memo, source, created_by, approved_by, posted_at, reversal_date, rejection_reason, rejected_by, rejected_at, created_at, updated_at`;
const LINE_COLS = `je_id, line_index, account_ref, debit, credit, description, amount_provenance`;

export async function insertJournalEntry(
  pool: Pool,
  id: string,
  input: {
    closeSessionId: string;
    tenantId: string;
    status: JournalEntryStatus;
    memo?: string;
    source: JournalEntrySource;
    createdBy?: string;
  }
): Promise<JournalEntry> {
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO journal_entries (id, close_session_id, tenant_id, status, memo, source, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
    [
      id,
      input.closeSessionId,
      input.tenantId,
      input.status,
      input.memo ?? null,
      input.source,
      input.createdBy ?? null,
      now,
    ]
  );
  const r = await pool.query<JournalEntryRow>(
    `SELECT ${JE_COLS} FROM journal_entries WHERE id = $1 AND tenant_id = $2`,
    [id, input.tenantId]
  );
  return rowToJE(r.rows[0]);
}

export async function getJournalEntryById(pool: Pool, id: string, tenantId: string): Promise<JournalEntry | null> {
  const r = await pool.query<JournalEntryRow>(
    `SELECT ${JE_COLS} FROM journal_entries WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return rowToJE(row);
}

export async function listJournalEntries(
  pool: Pool,
  tenantId: string,
  filters: { closeSessionId?: string; status?: JournalEntryStatus; limit?: number }
): Promise<JournalEntry[]> {
  let sql = `SELECT ${JE_COLS} FROM journal_entries WHERE tenant_id = $1`;
  const params: unknown[] = [tenantId];
  let i = 2;
  if (filters.closeSessionId) {
    sql += ` AND close_session_id = $${i}`;
    params.push(filters.closeSessionId);
    i += 1;
  }
  if (filters.status) {
    sql += ` AND status = $${i}`;
    params.push(filters.status);
    i += 1;
  }
  sql += ' ORDER BY created_at DESC';
  if (filters.limit != null && filters.limit > 0) {
    sql += ` LIMIT $${i}`;
    params.push(filters.limit);
  }
  const r = await pool.query<JournalEntryRow>(sql, params);
  return r.rows.map(rowToJE);
}

export async function updateJournalEntryStatus(
  pool: Pool,
  id: string,
  tenantId: string,
  status: JournalEntryStatus,
  patch?: {
    approvedBy?: string;
    postedAt?: string;
    reversalDate?: string | null;
    /** For status 'rejected': rejection reason, rejected_by, rejected_at. */
    rejectedBy?: string;
    rejectedAt?: string;
    rejectionReason?: string;
  }
): Promise<JournalEntry | null> {
  const now = new Date().toISOString();
  const approvedBy = patch?.approvedBy ?? null;
  const postedAt = patch?.postedAt ?? null;
  const reversalDate = patch?.reversalDate !== undefined ? patch.reversalDate : undefined;
  const setReversal = reversalDate !== undefined;
  const rejectedBy = patch?.rejectedBy ?? null;
  const rejectedAt = patch?.rejectedAt ?? now;
  const rejectionReason = patch?.rejectionReason ?? null;
  if (status === 'rejected' && rejectionReason) {
    await pool.query(
      `UPDATE journal_entries SET status = $3, updated_at = $4,
         rejection_reason = $5, rejected_by = $6, rejected_at = $7
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId, status, now, rejectionReason, rejectedBy, rejectedAt]
    );
  } else {
    await pool.query(
      `UPDATE journal_entries SET status = $3, updated_at = $4,
         approved_by = COALESCE($5, approved_by), posted_at = COALESCE($6, posted_at),
         reversal_date = CASE WHEN $8 THEN $7::date ELSE reversal_date END
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId, status, now, approvedBy, postedAt, reversalDate ?? null, setReversal]
    );
  }
  return getJournalEntryById(pool, id, tenantId);
}

/** Delete evidence links and then the journal entry. Caller must enforce status (draft/rejected only). */
export async function deleteJournalEntry(pool: Pool, id: string, tenantId: string): Promise<void> {
  await pool.query(
    `DELETE FROM evidence_links WHERE tenant_id = $1 AND object_type = 'journal_entry' AND object_id = $2`,
    [tenantId, id]
  );
  await pool.query(`DELETE FROM journal_entries WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
}

export async function insertJournalEntryLines(
  pool: Pool,
  jeId: string,
  lines: {
    accountRef: string;
    debit?: number;
    credit?: number;
    description?: string;
    amountProvenance?: AmountProvenance;
  }[]
): Promise<JournalEntryLine[]> {
  const result: JournalEntryLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const debit = l.debit ?? 0;
    const credit = l.credit ?? 0;
    const amountProvenanceJson =
      l.amountProvenance != null ? JSON.stringify(l.amountProvenance) : null;
    await pool.query(
      `INSERT INTO journal_entry_lines (je_id, line_index, account_ref, debit, credit, description, amount_provenance)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [jeId, i, l.accountRef, debit, credit, l.description ?? null, amountProvenanceJson]
    );
    result.push({
      jeId,
      lineIndex: i,
      accountRef: l.accountRef,
      debit,
      credit,
      description: l.description,
      amountProvenance: l.amountProvenance,
    });
  }
  return result;
}

export async function listJournalEntryLines(pool: Pool, jeId: string): Promise<JournalEntryLine[]> {
  const r = await pool.query<JournalEntryLineRow>(
    `SELECT ${LINE_COLS} FROM journal_entry_lines WHERE je_id = $1 ORDER BY line_index`,
    [jeId]
  );
  return r.rows.map(rowToLine);
}

export async function insertJEAttachment(
  pool: Pool,
  id: string,
  jeId: string,
  fileRef: string,
  tenantId: string
): Promise<JournalEntryAttachment> {
  await pool.query(
    `INSERT INTO je_attachments (id, je_id, file_ref) VALUES ($1, $2, $3)`,
    [id, jeId, fileRef]
  );
  const r = await pool.query<{ id: string; je_id: string; file_ref: string; uploaded_at: string }>(
    `SELECT a.id, a.je_id, a.file_ref, a.uploaded_at
     FROM je_attachments a
     JOIN journal_entries je ON a.je_id = je.id
     WHERE je.tenant_id = $1 AND a.id = $2`,
    [tenantId, id]
  );
  const row = r.rows[0];
  return { id: row.id, jeId: row.je_id, fileRef: row.file_ref, uploadedAt: row.uploaded_at };
}

export async function getJEAttachmentById(pool: Pool, tenantId: string, attachmentId: string): Promise<JournalEntryAttachment | null> {
  const r = await pool.query<{ id: string; je_id: string; file_ref: string; uploaded_at: string }>(
    `SELECT a.id, a.je_id, a.file_ref, a.uploaded_at
     FROM je_attachments a
     JOIN journal_entries je ON a.je_id = je.id
     WHERE je.tenant_id = $1 AND a.id = $2`,
    [tenantId, attachmentId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return { id: row.id, jeId: row.je_id, fileRef: row.file_ref, uploadedAt: row.uploaded_at };
}

export async function listJEAttachments(pool: Pool, jeId: string): Promise<JournalEntryAttachment[]> {
  const r = await pool.query<{ id: string; je_id: string; file_ref: string; uploaded_at: string }>(
    `SELECT id, je_id, file_ref, uploaded_at FROM je_attachments WHERE je_id = $1 ORDER BY uploaded_at`,
    [jeId]
  );
  return r.rows.map((row) => ({ id: row.id, jeId: row.je_id, fileRef: row.file_ref, uploadedAt: row.uploaded_at }));
}
