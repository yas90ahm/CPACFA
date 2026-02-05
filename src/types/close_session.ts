/**
 * Close session: (tenant, entity, period_start, period_end, basis, standard).
 * Imports, issues, reconciliations, JEs, statements, exports attach to close_session_id.
 */

export type CloseSessionBasis = 'cash' | 'accrual';

export type CloseSessionStandard = 'GAAP' | 'IFRS' | string;

export type CloseSessionStatus =
  | 'draft'
  | 'in_progress'
  | 'ready_for_review'
  | 'finalized'
  | 'locked'
  | 'certified';

export interface CloseSession {
  id: string;
  tenantId: string;
  entityId: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;   // YYYY-MM-DD
  basis: CloseSessionBasis;
  standard: CloseSessionStandard;
  status: CloseSessionStatus;
  certifiedBy?: string;
  certifiedAt?: string;  // ISO
  certificationMemo?: string;
  createdAt: string;  // ISO
  updatedAt: string;  // ISO
}

export interface CreateCloseSessionInput {
  tenantId: string;
  entityId: string;
  periodStart: string;
  periodEnd: string;
  basis?: CloseSessionBasis;
  standard?: CloseSessionStandard;
  status?: CloseSessionStatus;
}

export interface ListCloseSessionsInput {
  tenantId: string;
  entityId?: string;
  status?: CloseSessionStatus;
}
