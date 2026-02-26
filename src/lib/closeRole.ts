/**
 * Map API role from JWT to CloseRole for segregation checks.
 * accountant/preparer -> preparer; reviewer -> reviewer; approver/certifier/admin -> approver.
 * operating_partner -> preparer (read-only; portfolio routes enforce no write access).
 */

import type { CloseRole } from '../types/close_and_controls.js';

const CLOSE_ROLES: CloseRole[] = ['preparer', 'reviewer', 'approver'];

export function mapApiRoleToCloseRole(role: string | undefined): CloseRole {
  if (!role) return 'preparer';
  if (CLOSE_ROLES.includes(role as CloseRole)) return role as CloseRole;
  if (role === 'certifier' || role === 'admin') return 'approver';
  if (role === 'operating_partner') return 'preparer';
  return 'preparer';
}

export function getCloseRoleFromReq(req: { role?: string }): CloseRole {
  return mapApiRoleToCloseRole(req.role);
}
