/**
 * Approval requests and events — tenant-scoped.
 */

import type { Pool, PoolClient } from 'pg';
import type {
  ApprovalRequest,
  ApprovalRequestStatus,
  ApprovalRequestEvent,
  ApprovalRequestEventAction,
  ApprovalResourceType,
} from '../../types/approval_workflow.js';

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function createApprovalRequest(
  pool: Pool,
  tenantId: string,
  req: Omit<ApprovalRequest, 'id' | 'createdAt' | 'updatedAt'>
): Promise<ApprovalRequest> {
  const id = nextId('apr');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO approval_requests (id, tenant_id, workflow_id, resource_type, resource_id, current_step_index, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      tenantId,
      req.workflowId,
      req.resourceType,
      req.resourceId,
      req.currentStepIndex ?? 0,
      req.status ?? 'pending',
      now,
      now,
    ]
  );
  return { ...req, id, tenantId, createdAt: now, updatedAt: now };
}

/**
 * Create an approval request and its first "submitted" event in a single transaction.
 * Ensures no orphaned request row if the event insert fails.
 */
export async function createApprovalRequestAndFirstEvent(
  pool: Pool,
  tenantId: string,
  req: Omit<ApprovalRequest, 'id' | 'createdAt' | 'updatedAt'>,
  firstEvent: Omit<ApprovalRequestEvent, 'id' | 'requestId'>
): Promise<ApprovalRequest> {
  const id = nextId('apr');
  const now = new Date().toISOString();
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO approval_requests (id, tenant_id, workflow_id, resource_type, resource_id, current_step_index, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        tenantId,
        req.workflowId,
        req.resourceType,
        req.resourceId,
        req.currentStepIndex ?? 0,
        req.status ?? 'pending',
        now,
        now,
      ]
    );
    const eventId = nextId('ape');
    const at = firstEvent.at ?? now;
    await client.query(
      `INSERT INTO approval_request_events (id, request_id, step_index, actor, action, at, comment)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [eventId, id, firstEvent.stepIndex, firstEvent.actor, firstEvent.action, at, firstEvent.comment ?? null]
    );
    await client.query('COMMIT');
    return { ...req, id, tenantId, createdAt: now, updatedAt: now };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function getApprovalRequest(
  pool: Pool,
  id: string,
  tenantId: string
): Promise<ApprovalRequest | null> {
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    workflow_id: string;
    resource_type: string;
    resource_id: string;
    current_step_index: number;
    status: string;
    created_at: string;
    updated_at: string;
  }>(
    'SELECT id, tenant_id, workflow_id, resource_type, resource_id, current_step_index, status, created_at, updated_at FROM approval_requests WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    workflowId: row.workflow_id,
    resourceType: row.resource_type as ApprovalResourceType,
    resourceId: row.resource_id,
    currentStepIndex: row.current_step_index,
    status: row.status as ApprovalRequestStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getApprovalRequestByResource(
  pool: Pool,
  tenantId: string,
  resourceType: string,
  resourceId: string
): Promise<ApprovalRequest | null> {
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    workflow_id: string;
    resource_type: string;
    resource_id: string;
    current_step_index: number;
    status: string;
    created_at: string;
    updated_at: string;
  }>(
    'SELECT id, tenant_id, workflow_id, resource_type, resource_id, current_step_index, status, created_at, updated_at FROM approval_requests WHERE tenant_id = $1 AND resource_type = $2 AND resource_id = $3 AND status = $4 ORDER BY created_at DESC LIMIT 1',
    [tenantId, resourceType, resourceId, 'pending']
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    workflowId: row.workflow_id,
    resourceType: row.resource_type as ApprovalResourceType,
    resourceId: row.resource_id,
    currentStepIndex: row.current_step_index,
    status: row.status as ApprovalRequestStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listApprovalRequests(
  pool: Pool,
  tenantId: string,
  params?: { resourceType?: string; resourceId?: string; status?: ApprovalRequestStatus }
): Promise<ApprovalRequest[]> {
  let sql =
    'SELECT id, tenant_id, workflow_id, resource_type, resource_id, current_step_index, status, created_at, updated_at FROM approval_requests WHERE tenant_id = $1';
  const args: unknown[] = [tenantId];
  let i = 2;
  if (params?.resourceType) {
    sql += ` AND resource_type = $${i}`;
    args.push(params.resourceType);
    i += 1;
  }
  if (params?.resourceId) {
    sql += ` AND resource_id = $${i}`;
    args.push(params.resourceId);
    i += 1;
  }
  if (params?.status) {
    sql += ` AND status = $${i}`;
    args.push(params.status);
    i += 1;
  }
  sql += ' ORDER BY created_at DESC';
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    workflow_id: string;
    resource_type: string;
    resource_id: string;
    current_step_index: number;
    status: string;
    created_at: string;
    updated_at: string;
  }>(sql, args);
  return r.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    workflowId: row.workflow_id,
    resourceType: row.resource_type as ApprovalResourceType,
    resourceId: row.resource_id,
    currentStepIndex: row.current_step_index,
    status: row.status as ApprovalRequestStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function updateApprovalRequest(
  pool: Pool,
  id: string,
  tenantId: string,
  update: { currentStepIndex?: number; status?: ApprovalRequestStatus }
): Promise<ApprovalRequest | null> {
  const now = new Date().toISOString();
  await pool.query(
    'UPDATE approval_requests SET current_step_index = COALESCE($3, current_step_index), status = COALESCE($4, status), updated_at = $5 WHERE id = $1 AND tenant_id = $2',
    [id, tenantId, update.currentStepIndex ?? null, update.status ?? null, now]
  );
  return getApprovalRequest(pool, id, tenantId);
}

export async function addApprovalRequestEvent(
  pool: Pool,
  requestId: string,
  event: Omit<ApprovalRequestEvent, 'id'>
): Promise<ApprovalRequestEvent> {
  const id = nextId('ape');
  const at = event.at ?? new Date().toISOString();
  await pool.query(
    `INSERT INTO approval_request_events (id, request_id, step_index, actor, action, at, comment)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, requestId, event.stepIndex, event.actor, event.action, at, event.comment ?? null]
  );
  return { ...event, id, at };
}
