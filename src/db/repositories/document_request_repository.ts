/**
 * Document request list (DRL) — tenant-scoped.
 */

import type { Pool } from 'pg';
import type { DocumentRequest } from '../../types/audit_evidence.js';

function nextId(): string {
  return `drl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function createDocumentRequest(
  pool: Pool,
  tenantId: string,
  params: {
    requestLabel: string;
    documentId?: string;
    status?: DocumentRequest['status'];
    assignee?: string;
    dueDate?: string;
  }
): Promise<DocumentRequest> {
  const id = nextId();
  const requestedAt = new Date().toISOString();
  await pool.query(
    `INSERT INTO document_requests (id, tenant_id, request_label, document_id, status, requested_at, assignee, due_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      tenantId,
      params.requestLabel,
      params.documentId ?? null,
      params.status ?? 'pending',
      requestedAt,
      params.assignee ?? null,
      params.dueDate ?? null,
    ]
  );
  return {
    id,
    requestLabel: params.requestLabel,
    documentId: params.documentId,
    status: params.status ?? 'pending',
    requestedAt,
    assignee: params.assignee,
    dueDate: params.dueDate,
  };
}

export async function getDocumentRequest(pool: Pool, id: string, tenantId: string): Promise<DocumentRequest | null> {
  const r = await pool.query<{
    id: string;
    request_label: string;
    document_id: string | null;
    status: string;
    requested_at: string;
    fulfilled_at: string | null;
    assignee: string | null;
    due_date: string | null;
  }>(
    'SELECT id, request_label, document_id, status, requested_at, fulfilled_at, assignee, due_date FROM document_requests WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    requestLabel: row.request_label,
    documentId: row.document_id ?? undefined,
    status: row.status as DocumentRequest['status'],
    requestedAt: row.requested_at,
    fulfilledAt: row.fulfilled_at ?? undefined,
    assignee: row.assignee ?? undefined,
    dueDate: row.due_date ?? undefined,
  };
}

export async function listDocumentRequests(
  pool: Pool,
  tenantId: string,
  status?: DocumentRequest['status']
): Promise<DocumentRequest[]> {
  let sql =
    'SELECT id, request_label, document_id, status, requested_at, fulfilled_at, assignee, due_date FROM document_requests WHERE tenant_id = $1';
  const args: unknown[] = [tenantId];
  if (status) {
    sql += ' AND status = $2';
    args.push(status);
  }
  sql += ' ORDER BY requested_at DESC';
  const r = await pool.query<{
    id: string;
    request_label: string;
    document_id: string | null;
    status: string;
    requested_at: string;
    fulfilled_at: string | null;
    assignee: string | null;
    due_date: string | null;
  }>(sql, args);
  return r.rows.map((row) => ({
    id: row.id,
    requestLabel: row.request_label,
    documentId: row.document_id ?? undefined,
    status: row.status as DocumentRequest['status'],
    requestedAt: row.requested_at,
    fulfilledAt: row.fulfilled_at ?? undefined,
    assignee: row.assignee ?? undefined,
    dueDate: row.due_date ?? undefined,
  }));
}

export async function updateDocumentRequest(
  pool: Pool,
  id: string,
  tenantId: string,
  patch: { assignee?: string; dueDate?: string; status?: DocumentRequest['status'] }
): Promise<DocumentRequest | null> {
  const updates: string[] = [];
  const args: unknown[] = [];
  let i = 1;
  if (patch.assignee !== undefined) {
    updates.push(`assignee = $${i}`);
    args.push(patch.assignee);
    i += 1;
  }
  if (patch.dueDate !== undefined) {
    updates.push(`due_date = $${i}`);
    args.push(patch.dueDate);
    i += 1;
  }
  if (patch.status !== undefined) {
    updates.push(`status = $${i}`);
    args.push(patch.status);
    i += 1;
  }
  if (updates.length === 0) return getDocumentRequest(pool, id, tenantId);
  args.push(id, tenantId);
  await pool.query(
    `UPDATE document_requests SET ${updates.join(', ')} WHERE id = $${i} AND tenant_id = $${i + 1}`,
    args
  );
  return getDocumentRequest(pool, id, tenantId);
}

export async function fulfillDocumentRequest(
  pool: Pool,
  id: string,
  tenantId: string,
  documentId: string
): Promise<DocumentRequest | null> {
  const fulfilledAt = new Date().toISOString();
  const r = await pool.query(
    `UPDATE document_requests SET document_id = $1, status = 'fulfilled', fulfilled_at = $2 WHERE id = $3 AND tenant_id = $4 RETURNING id`,
    [documentId, fulfilledAt, id, tenantId]
  );
  if (r.rowCount === 0) return null;
  return getDocumentRequest(pool, id, tenantId);
}
