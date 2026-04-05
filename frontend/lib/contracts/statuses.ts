/**
 * Canonical status enums for all close workflow entities.
 * Single source of truth — replace ALL ad-hoc string literals with these.
 */

// --- Close Session ---
export const SessionStatus = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  UNDER_REVIEW: 'under_review',
  CERTIFIED: 'certified',
  SUBSEQUENT_EVENTS_REVIEW: 'subsequent_events_review',
  LOCKED: 'locked',
} as const;
export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus];

export function isSessionTerminal(status: string): boolean {
  return status === SessionStatus.LOCKED;
}

export function isSessionCertified(status: string): boolean {
  return status === SessionStatus.CERTIFIED
    || status === SessionStatus.SUBSEQUENT_EVENTS_REVIEW
    || status === SessionStatus.LOCKED;
}

// --- Journal Entry ---
export const JEStatus = {
  DRAFT: 'draft',
  PROPOSED: 'proposed',
  PENDING_APPROVAL: 'pending_approval',
  APPROVED: 'approved',
  POSTED: 'posted',
  EXPORTED: 'exported',
  REJECTED: 'rejected',
} as const;
export type JEStatus = (typeof JEStatus)[keyof typeof JEStatus];

export function isJEPending(status: string): boolean {
  return status === JEStatus.PROPOSED || status === JEStatus.PENDING_APPROVAL;
}

export function isJEBooked(status: string): boolean {
  return status === JEStatus.POSTED || status === JEStatus.EXPORTED;
}

// --- Module Proposal ---
export const ProposalStatus = {
  NEEDS_REVIEW: 'needs_review',
  APPROVED: 'approved',
  SKIPPED: 'skipped',
  NOT_APPLICABLE: 'not_applicable',
  FAILED: 'failed',
} as const;
export type ProposalStatus = (typeof ProposalStatus)[keyof typeof ProposalStatus];

export function isProposalResolved(status: string): boolean {
  return (
    status === ProposalStatus.APPROVED ||
    status === ProposalStatus.SKIPPED ||
    status === ProposalStatus.NOT_APPLICABLE
  );
}

export function isProposalBlocking(status: string): boolean {
  return (
    status === ProposalStatus.FAILED ||
    status === ProposalStatus.NEEDS_REVIEW
  );
}

// --- Reconciliation ---
export const ReconStatus = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  APPROVED: 'approved',
  RECONCILED: 'reconciled',
} as const;
export type ReconStatus = (typeof ReconStatus)[keyof typeof ReconStatus];

export function isReconComplete(status: string): boolean {
  return status === ReconStatus.COMPLETED || status === ReconStatus.APPROVED || status === ReconStatus.RECONCILED;
}

// --- Mapping ---
export const MappingDisplayStatus = {
  CONFIRMED: 'Confirmed',
  RECOMMENDED: 'Recommended',
  UNMAPPED: 'Unmapped',
  REJECTED: 'Rejected',
  OVERRIDE: 'Override',
} as const;
export type MappingDisplayStatus = (typeof MappingDisplayStatus)[keyof typeof MappingDisplayStatus];

// --- Readiness Gate ---
export interface Gate {
  id: string;
  name?: string;
  label: string;
  passing: boolean;
  detail?: string;
  description?: string;
  category?: 'hard' | 'soft';
  navigateTo?: string;
}

export function gateStatus(gate: Gate): 'passing' | 'failing' | 'active' {
  return gate.passing ? 'passing' : 'failing';
}

// --- Issue ---
export const IssueStatus = {
  OPEN: 'open',
  ACTIVE: 'active',
  RESOLVED: 'resolved',
  DISMISSED: 'dismissed',
} as const;
export type IssueStatus = (typeof IssueStatus)[keyof typeof IssueStatus];

export function isIssueOpen(status: string): boolean {
  return status === IssueStatus.OPEN || status === IssueStatus.ACTIVE;
}

// --- Variance ---
export const VarianceExplanationStatus = {
  UNEXPLAINED: 'unexplained',
  AI_DRAFTED: 'ai_drafted',
  DRAFT_READY: 'draft_ready',
  EXPLAINED: 'explained',
  APPROVED: 'approved',
} as const;
export type VarianceExplanationStatus =
  (typeof VarianceExplanationStatus)[keyof typeof VarianceExplanationStatus];

export function isVarianceExplained(status: string): boolean {
  return status === VarianceExplanationStatus.EXPLAINED || status === VarianceExplanationStatus.APPROVED;
}
