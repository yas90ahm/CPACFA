/**
 * Zod schemas for approval workflow and request API routes.
 */

import { z } from 'zod';
import { idParamSchema } from './commonSchemas.js';

// ============================================================================
// POST /workflows — Create workflow
// ============================================================================

const closeRoleSchema = z.enum(['preparer', 'reviewer', 'approver']);
const approvalResourceTypeSchema = z.enum(['close_adjustment', 'budget_version', 'close_checklist']);

const workflowStepSchema = z.object({
  order: z.number().int().nonnegative(),
  requiredRole: closeRoleSchema,
  namedApprover: z.string().optional(),
});

export const createWorkflowBodySchema = z.object({
  name: z.string().min(1, 'name required'),
  resourceType: approvalResourceTypeSchema,
  steps: z.array(workflowStepSchema).min(1, 'At least one step required'),
});

// ============================================================================
// POST /submit — Submit resource for approval
// ============================================================================

export const submitApprovalBodySchema = z.object({
  resourceType: approvalResourceTypeSchema,
  resourceId: z.string().min(1, 'resourceId required'),
});

// ============================================================================
// PATCH /requests/:id — Approve or reject
// ============================================================================

export const approveRejectBodySchema = z.object({
  action: z.enum(['approved', 'rejected']),
  actor: z.string().optional(),
  comment: z.string().optional(),
});

// ============================================================================
// Path params (PATCH /requests/:id)
// ============================================================================

export const requestIdParamSchema = idParamSchema;
