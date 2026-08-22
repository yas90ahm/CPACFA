/**
 * Close checklist items: per-session required controls for readiness gating.
 * Codes are sourced from the active accounting close profile.
 */

import type { CanadianAspeRequirementCode } from './accounting_close_profile.js';

export type CloseChecklistItemStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

export type CloseChecklistItemCode = CanadianAspeRequirementCode;

export interface CloseChecklistItem {
  id: string;
  closeSessionId: string;
  code: CloseChecklistItemCode;
  name: string;
  status: CloseChecklistItemStatus;
  required: boolean;
  completedBy?: string;
  completedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CloseReadinessResult {
  ready: boolean;
  hardBlockers: string[];
  softWarnings: string[];
  checklistComplete: boolean;
  cashRecComplete: boolean;
  noCriticalIssues: boolean;
  materialJesApproved: boolean;
  integrityChecksPass: boolean;
  /** Persisted approved-runbook gate; absent only on legacy mocked callers. */
  runbookComplete?: boolean;
  runbookDetail?: string;
  /** Total journal entries count (0 means none posted) */
  jeTotal: number;
}
