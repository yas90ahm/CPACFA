/**
 * Approval workflow definitions: CRUD, get by resource_type.
 */

import type { Pool } from 'pg';
import type {
  ApprovalWorkflowDef,
  ApprovalWorkflowStep,
  ApprovalResourceType,
} from '../types/approval_workflow.js';
import {
  createWorkflow,
  getWorkflowByResourceType,
  listWorkflows,
} from '../db/repositories/approval_workflow_repository.js';

export async function createWorkflowDef(
  pool: Pool,
  tenantId: string,
  def: Omit<ApprovalWorkflowDef, 'id' | 'steps' | 'createdAt' | 'updatedAt'>,
  steps: Omit<ApprovalWorkflowStep, 'id' | 'workflowId'>[]
): Promise<ApprovalWorkflowDef> {
  return createWorkflow(pool, tenantId, { ...def, tenantId, steps: [] }, steps);
}

export async function getWorkflowForResourceType(
  pool: Pool,
  tenantId: string,
  resourceType: ApprovalResourceType
): Promise<ApprovalWorkflowDef | null> {
  return getWorkflowByResourceType(pool, tenantId, resourceType);
}

export async function listWorkflowsForTenant(
  pool: Pool,
  tenantId: string
): Promise<ApprovalWorkflowDef[]> {
  return listWorkflows(pool, tenantId);
}
