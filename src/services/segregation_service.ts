/**
 * Segregation of duties: preparer vs reviewer vs approver for close and critical actions.
 */

import type { CloseRole } from '../types/close_and_controls.js';
import { appendAuditLog, type AuditLogContext } from './audit_log_service.js';

/** Actions that require a role */
export type ControlledAction =
  | 'close_checklist_complete'
  | 'period_lock'
  | 'je_suggest_approve'
  | 'je_post'
  | 'variance_confirm'
  | 'audit_log_retention_purge';

/** Minimum role required per action (approver > reviewer > preparer) */
const ACTION_ROLE: Record<ControlledAction, CloseRole> = {
  close_checklist_complete: 'reviewer',
  period_lock: 'approver',
  je_suggest_approve: 'approver',
  je_post: 'approver',
  variance_confirm: 'reviewer',
  audit_log_retention_purge: 'approver',
};

const ROLE_ORDER: CloseRole[] = ['preparer', 'reviewer', 'approver'];

function roleLevel(r: CloseRole): number {
  const i = ROLE_ORDER.indexOf(r);
  return i >= 0 ? i : -1;
}

/**
 * Check if actor's role is sufficient for the action. Returns true if allowed.
 */
export function canPerform(actorRole: CloseRole, action: ControlledAction): boolean {
  const required = ACTION_ROLE[action];
  return roleLevel(actorRole) >= roleLevel(required);
}

/**
 * Perform a controlled action: check role, then append to audit log. Returns { allowed, auditEntry }.
 * When context (pool, tenantId) is provided, audit entry is persisted to tenant DB.
 */
export function performControlledAction(
  actor: string,
  actorRole: CloseRole,
  action: ControlledAction,
  resource?: string,
  detail?: string,
  payload?: Record<string, unknown>,
  context?: AuditLogContext
): { allowed: boolean; auditEntry?: import('../types/close_and_controls.js').AuditLogEntry } {
  const allowed = canPerform(actorRole, action);
  const auditEntry = appendAuditLog(
    {
      actor,
      action,
      resource,
      detail: detail ?? (allowed ? undefined : 'Denied: insufficient role'),
      payload: { ...payload, actorRole, requiredRole: ACTION_ROLE[action], allowed },
    },
    context
  );
  return { allowed, auditEntry };
}
