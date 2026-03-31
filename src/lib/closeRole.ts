/**
 * Map API role (persona) from JWT to CloseRole for segregation checks.
 *
 * Persona -> CloseRole mappings:
 *   controller        -> approver (owns the close, can approve JEs, post entries)
 *   senior_accountant  -> preparer (operational work, cannot approve own work)
 *   cfo               -> approver (certify, lock, override shadow auditor blocks)
 *   reviewer          -> reviewer (approve/reject packages, read-only review mode)
 *   internal_auditor   -> preparer (read-only governance observer)
 *   pe_operating_partner -> preparer (read-only portfolio access)
 *   external_auditor   -> preparer (read-only verification access)
 *   system_admin       -> approver (full admin access, settings, team management)
 *
 * CloseRole is the internal segregation tier: preparer | reviewer | approver.
 */

import type { CloseRole } from '../types/close_and_controls.js';

const CLOSE_ROLES: CloseRole[] = ['preparer', 'reviewer', 'approver'];

export function mapApiRoleToCloseRole(role: string | undefined): CloseRole {
  if (!role) return 'preparer';
  if (CLOSE_ROLES.includes(role as CloseRole)) return role as CloseRole;
  // New persona mappings
  if (role === 'controller') return 'approver';
  if (role === 'senior_accountant') return 'preparer';
  if (role === 'cfo') return 'approver';
  if (role === 'reviewer') return 'reviewer';
  if (role === 'internal_auditor') return 'preparer';
  if (role === 'pe_operating_partner') return 'preparer';
  if (role === 'external_auditor') return 'preparer';
  if (role === 'system_admin') return 'approver';
  // Legacy fallbacks
  if (role === 'certifier' || role === 'admin' || role === 'approver') return 'approver';
  if (role === 'accountant' || role === 'preparer') return 'preparer';
  if (role === 'operating_partner') return 'preparer';
  return 'preparer';
}

export function getCloseRoleFromReq(req: { role?: string }): CloseRole {
  return mapApiRoleToCloseRole(req.role);
}
