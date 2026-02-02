/**
 * Map API role from JWT to CloseRole for segregation checks.
 * accountant -> preparer; preparer, reviewer, approver pass through.
 */

import type { CloseRole } from '../types/close_and_controls.js';

const CLOSE_ROLES: CloseRole[] = ['preparer', 'reviewer', 'approver'];

export function mapApiRoleToCloseRole(role: string | undefined): CloseRole {
  if (!role) return 'preparer';
  if (CLOSE_ROLES.includes(role as CloseRole)) return role as CloseRole;
  return 'preparer';
}

export function getCloseRoleFromReq(req: { role?: string }): CloseRole {
  return mapApiRoleToCloseRole(req.role);
}
