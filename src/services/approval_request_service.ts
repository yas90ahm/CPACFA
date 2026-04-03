/**
 * Approval request execution: create, approve/reject, advance step.
 */

import type { Pool } from 'pg';
import type { ApprovalRequest, ApprovalResourceType } from '../types/approval_workflow.js';
import type { ApprovalWorkflowDef } from '../types/approval_workflow.js';
import { getWorkflowByResourceType } from '../db/repositories/approval_workflow_repository.js';
import {
  createApprovalRequestAndFirstEvent,
  getApprovalRequest,
  getApprovalRequestByResource,
  listApprovalRequests,
  updateApprovalRequest,
  addApprovalRequestEvent,
} from '../db/repositories/approval_request_repository.js';

export interface ApproveRejectResult {
  request: ApprovalRequest;
  performedAction?: 'approved' | 'rejected';
  /** If approved and workflow complete, caller should set resource status (e.g. adjustment to approved) */
  workflowComplete: boolean;
}

export async function createRequest(
  pool: Pool,
  tenantId: string,
  workflowId: string,
  resourceType: ApprovalResourceType,
  resourceId: string
): Promise<ApprovalRequest> {
  const request = await createApprovalRequestAndFirstEvent(
    pool,
    tenantId,
    {
      tenantId,
      workflowId,
      resourceType,
      resourceId,
      currentStepIndex: 0,
      status: 'pending',
    },
    {
      stepIndex: 0,
      actor: 'system',
      action: 'submitted',
      at: new Date().toISOString(),
    }
  );

  // Notify approver of pending request
  try {
    const { notify } = await import('./notification_service.js');
    await notify({
      tenantId,
      eventType: 'approval_required',
      title: 'Approval needed',
      body: `${resourceType} ${resourceId} is waiting for your approval`,
      data: { resourceType, resourceId, requestId: request.id },
    });
  } catch { /* non-fatal */ }

  return request;
}

export async function getRequest(
  pool: Pool,
  requestId: string,
  tenantId: string
): Promise<ApprovalRequest | null> {
  return getApprovalRequest(pool, requestId, tenantId);
}

export async function getRequestByResource(
  pool: Pool,
  tenantId: string,
  resourceType: string,
  resourceId: string
): Promise<ApprovalRequest | null> {
  return getApprovalRequestByResource(pool, tenantId, resourceType, resourceId);
}

export async function listRequests(
  pool: Pool,
  tenantId: string,
  params?: { resourceType?: string; resourceId?: string; status?: ApprovalRequest['status'] }
): Promise<ApprovalRequest[]> {
  return listApprovalRequests(pool, tenantId, params);
}

export async function approveOrReject(
  pool: Pool,
  requestId: string,
  tenantId: string,
  actor: string,
  action: 'approved' | 'rejected',
  comment?: string
): Promise<ApproveRejectResult | null> {
  const request = await getApprovalRequest(pool, requestId, tenantId);
  if (!request || request.status !== 'pending') return null;

  const workflow = await getWorkflowByResourceType(pool, tenantId, request.resourceType);
  if (!workflow || workflow.steps.length === 0) return null;

  const currentStep = workflow.steps[request.currentStepIndex];
  if (!currentStep) return null;

  // Enforce step-level approval constraints
  if (currentStep.namedApprover && actor !== currentStep.namedApprover) {
    return { ok: false, error: `This step requires approval by ${currentStep.namedApprover}` } as any;
  }

  await addApprovalRequestEvent(pool, requestId, {
    requestId,
    stepIndex: request.currentStepIndex,
    actor,
    action,
    at: new Date().toISOString(),
    comment,
  });

  if (action === 'rejected') {
    await updateApprovalRequest(pool, requestId, tenantId, { status: 'rejected' });
    const updated = await getApprovalRequest(pool, requestId, tenantId);
    return updated ? { request: updated, performedAction: 'rejected', workflowComplete: false } : null;
  }

  const nextIndex = request.currentStepIndex + 1;
  if (nextIndex >= workflow.steps.length) {
    await updateApprovalRequest(pool, requestId, tenantId, { status: 'approved' });
    const updated = await getApprovalRequest(pool, requestId, tenantId);
    return updated ? { request: updated, performedAction: 'approved', workflowComplete: true } : null;
  }
  await updateApprovalRequest(pool, requestId, tenantId, { currentStepIndex: nextIndex });
  const updated = await getApprovalRequest(pool, requestId, tenantId);
  return updated ? { request: updated, performedAction: 'approved', workflowComplete: false } : null;
}
