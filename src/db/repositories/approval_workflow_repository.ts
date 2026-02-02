/**
 * Approval workflow defs and steps — tenant-scoped.
 */

import type { Pool } from 'pg';
import type {
  ApprovalWorkflowDef,
  ApprovalWorkflowStep,
  ApprovalResourceType,
} from '../../types/approval_workflow.js';
import type { CloseRole } from '../../types/close_and_controls.js';

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function createWorkflow(
  pool: Pool,
  tenantId: string,
  def: Omit<ApprovalWorkflowDef, 'id' | 'createdAt' | 'updatedAt'>,
  steps: Omit<ApprovalWorkflowStep, 'id' | 'workflowId'>[]
): Promise<ApprovalWorkflowDef> {
  const id = nextId('awf');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO approval_workflow_defs (id, tenant_id, name, resource_type, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, tenantId, def.name, def.resourceType, now, now]
  );
  for (const step of steps.sort((a, b) => a.order - b.order)) {
    const stepId = nextId('aws');
    await pool.query(
      `INSERT INTO approval_workflow_steps (id, workflow_id, "order", required_role, named_approver)
       VALUES ($1, $2, $3, $4, $5)`,
      [stepId, id, step.order, step.requiredRole, step.namedApprover ?? null]
    );
  }
  const fullSteps = await listSteps(pool, id);
  return { ...def, id, tenantId, steps: fullSteps, createdAt: now, updatedAt: now };
}

export async function getWorkflowByResourceType(
  pool: Pool,
  tenantId: string,
  resourceType: ApprovalResourceType
): Promise<ApprovalWorkflowDef | null> {
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    name: string;
    resource_type: string;
    created_at: string;
    updated_at: string;
  }>('SELECT id, tenant_id, name, resource_type, created_at, updated_at FROM approval_workflow_defs WHERE tenant_id = $1 AND resource_type = $2', [
    tenantId,
    resourceType,
  ]);
  const row = r.rows[0];
  if (!row) return null;
  const steps = await listSteps(pool, row.id);
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    resourceType: row.resource_type as ApprovalResourceType,
    steps,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listWorkflows(pool: Pool, tenantId: string): Promise<ApprovalWorkflowDef[]> {
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    name: string;
    resource_type: string;
    created_at: string;
    updated_at: string;
  }>('SELECT id, tenant_id, name, resource_type, created_at, updated_at FROM approval_workflow_defs WHERE tenant_id = $1 ORDER BY created_at', [
    tenantId,
  ]);
  const result: ApprovalWorkflowDef[] = [];
  for (const row of r.rows) {
    const steps = await listSteps(pool, row.id);
    result.push({
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      resourceType: row.resource_type as ApprovalResourceType,
      steps,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
  return result;
}

async function listSteps(pool: Pool, workflowId: string): Promise<ApprovalWorkflowStep[]> {
  const r = await pool.query<{
    id: string;
    workflow_id: string;
    order: number;
    required_role: string;
    named_approver: string | null;
  }>('SELECT id, workflow_id, "order", required_role, named_approver FROM approval_workflow_steps WHERE workflow_id = $1 ORDER BY "order"', [
    workflowId,
  ]);
  return r.rows.map((row) => ({
    id: row.id,
    workflowId: row.workflow_id,
    order: row.order,
    requiredRole: row.required_role as CloseRole,
    namedApprover: row.named_approver ?? undefined,
  }));
}
