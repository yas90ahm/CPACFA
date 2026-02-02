/**
 * Configurable approval workflows and request execution.
 */

import type { CloseRole } from './close_and_controls.js';

export type ApprovalResourceType = 'close_adjustment' | 'budget_version' | 'close_checklist';

export interface ApprovalWorkflowStep {
  id: string;
  workflowId: string;
  order: number;
  requiredRole: CloseRole;
  /** Optional named approver (overrides role) */
  namedApprover?: string;
}

export interface ApprovalWorkflowDef {
  id: string;
  tenantId: string;
  name: string;
  resourceType: ApprovalResourceType;
  steps: ApprovalWorkflowStep[];
  createdAt?: string;
  updatedAt?: string;
}

export type ApprovalRequestStatus = 'pending' | 'approved' | 'rejected';

export interface ApprovalRequest {
  id: string;
  tenantId: string;
  workflowId: string;
  resourceType: ApprovalResourceType;
  resourceId: string;
  currentStepIndex: number;
  status: ApprovalRequestStatus;
  createdAt: string;
  updatedAt: string;
}

export type ApprovalRequestEventAction = 'submitted' | 'approved' | 'rejected';

export interface ApprovalRequestEvent {
  id: string;
  requestId: string;
  stepIndex: number;
  actor: string;
  action: ApprovalRequestEventAction;
  at: string; // ISO
  comment?: string;
}
