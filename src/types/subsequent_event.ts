/**
 * Subsequent Event: ASC 855 post-balance-sheet-date event tracking.
 * Events are recorded between CERTIFIED and LOCKED states.
 */

export type SubsequentEventDisposition =
  | 'no_impact'
  | 'requires_adjustment'
  | 'requires_disclosure';

export interface SubsequentEvent {
  id: string;
  tenantId: string;
  closeSessionId: string;
  eventDate: string;
  description: string;
  impactAssessment: string | null;
  disposition: SubsequentEventDisposition | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSubsequentEventInput {
  tenantId: string;
  closeSessionId: string;
  eventDate: string;
  description: string;
  impactAssessment?: string;
  createdBy: string;
}

export interface UpdateSubsequentEventInput {
  disposition: SubsequentEventDisposition;
  impactAssessment?: string;
  reviewedBy: string;
}
