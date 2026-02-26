/**
 * Encapsulates "update close adjustment status" (approved / rejected / posted):
 * load adjustment, assert period not locked, approval workflow checks, canPerform,
 * and when status=posted resolve connectionId, push to GL, then update. Used by PATCH /api/close/adjustments/:id.
 */

import type { Pool } from 'pg';
import type { CloseAdjustment, CloseAdjustmentStatus } from '../types/close_and_controls.js';
import type { CloseRole } from '../types/close_and_controls.js';
import { getAdjustment, updateAdjustmentStatus } from './close_adjustments_service.js';
import { assertPeriodNotLocked, PeriodLockedError } from './period_lock_service.js';
import { getWorkflowForResourceType } from './approval_workflow_service.js';
import { getRequestByResource } from './approval_request_service.js';
import { canPerform, type ControlledAction } from './segregation_service.js';
import { listConnections } from './accounting_integration_service.js';
import { pushAdjustmentToGL } from './push_close_to_gl_service.js';
import { recordAuditLogAction } from './audit_service.js';
import { createJustification } from './justification_service.js';

export interface UpdateCloseAdjustmentStatusParams {
  id: string;
  status: CloseAdjustmentStatus;
  approvedBy?: string;
  connectionId?: string;
  tenantId: string;
  pool: Pool;
  actorRole: CloseRole;
  actorUserId?: string;
}

export type UpdateCloseAdjustmentStatusResult =
  | { updated: CloseAdjustment }
  | {
      error: string;
      statusCode: number;
      periodLabel?: string;
      approvalRequestId?: string;
      errors?: string[];
    };

/**
 * Update adjustment status. Returns either { updated } or { error, statusCode, ... }.
 * Caller should send res.status(result.statusCode).json(...) or res.json(result.updated) accordingly.
 */
export async function updateCloseAdjustmentStatus(
  params: UpdateCloseAdjustmentStatusParams
): Promise<UpdateCloseAdjustmentStatusResult> {
  const { id, status, approvedBy, connectionId: bodyConnectionId, tenantId, pool, actorRole, actorUserId } = params;

  const existing = await getAdjustment(pool, id, tenantId);
  if (!existing) {
    return { error: 'Adjustment not found', statusCode: 404 };
  }

  try {
    await assertPeriodNotLocked(existing.periodLabel, tenantId, pool);
  } catch (e) {
    if (e instanceof PeriodLockedError) {
      await recordAuditLogAction(pool, tenantId, {
        action: 'period_edit_blocked',
        resource: `period:${e.periodLabel}`,
        detail: 'Period is locked',
        actor: actorUserId ?? 'anonymous',
      });
      return { error: 'Period locked', statusCode: 403, periodLabel: e.periodLabel };
    }
    throw e;
  }

  if (status === 'approved' || status === 'posted') {
    const workflow = await getWorkflowForResourceType(pool, tenantId, 'close_adjustment');
    if (workflow) {
      const pending = await getRequestByResource(pool, tenantId, 'close_adjustment', id);
      if (!pending) {
        return {
          error: 'Approval workflow required',
          statusCode: 400,
          approvalRequestId: undefined,
        };
      }
      return {
        error: 'Approve via approval request',
        statusCode: 400,
        approvalRequestId: pending.id,
      };
    }
  }

  if (status === 'approved' || status === 'posted') {
    const action: ControlledAction = status === 'posted' ? 'je_post' : 'je_suggest_approve';
    if (!canPerform(actorRole, action)) {
      return { error: 'Insufficient role for this action', statusCode: 403 };
    }
  }

  if (status === 'posted') {
    let connectionId = bodyConnectionId;
    if (!connectionId) {
      const connections = await listConnections(tenantId, pool);
      if (connections.length === 0) {
        return {
          error: 'No accounting connection',
          statusCode: 400,
          errors: ['No accounting connection; add one or pass connectionId.'],
        };
      }
      connectionId = connections[0].id;
    }

    if (existing.postedExternalId) {
      const updated = await updateAdjustmentStatus(id, 'posted', approvedBy, tenantId, pool, {
        postedAt: existing.postedAt ?? new Date().toISOString(),
        postedExternalId: existing.postedExternalId,
      });
      if (updated) {
        await recordAuditLogAction(pool, tenantId, {
          action: 'close_adjustment_post',
          resource: `adjustment:${id}`,
          actor: approvedBy ?? actorUserId ?? 'anonymous',
        });
        return { updated };
      }
      return { error: 'Adjustment not found', statusCode: 404 };
    }

    const pushResult = await pushAdjustmentToGL(existing, connectionId, pool, tenantId);
    if (pushResult.notImplemented) {
      return { error: 'GL post-back is disabled', statusCode: 501, errors: pushResult.errors };
    }
    if (!pushResult.success) {
      return {
        error: 'Push to GL failed',
        statusCode: 502,
        errors: pushResult.errors,
      };
    }

    const now = new Date().toISOString();
    const updated = await updateAdjustmentStatus(id, 'posted', approvedBy, tenantId, pool, {
      postedAt: now,
      postedExternalId: pushResult.externalId,
    });
    if (!updated) {
      return { error: 'Adjustment not found', statusCode: 404 };
    }
    await recordAuditLogAction(pool, tenantId, {
      action: 'close_adjustment_post',
      resource: `adjustment:${id}`,
      actor: approvedBy ?? actorUserId ?? 'anonymous',
    });
    await createJustification({
      tenantId,
      pool,
      periodLabel: existing.periodLabel,
      relatedType: 'close_adjustment',
      relatedId: id,
      memoMarkdown: existing.description,
      createdBy: approvedBy ?? actorUserId,
      createdByType: 'user',
    });
    return { updated };
  }

  const updated = await updateAdjustmentStatus(id, status, approvedBy, tenantId, pool);
  if (!updated) {
    return { error: 'Adjustment not found', statusCode: 404 };
  }
  if (status === 'approved') {
    await createJustification({
      tenantId,
      pool,
      periodLabel: existing.periodLabel,
      relatedType: 'close_adjustment',
      relatedId: id,
      memoMarkdown: existing.description,
      createdBy: approvedBy ?? actorUserId,
      createdByType: 'user',
    });
  }
  return { updated };
}
