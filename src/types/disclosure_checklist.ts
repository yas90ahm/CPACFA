/**
 * Disclosure checklist — required disclosures by standard (ASC 205/210/220 etc.) with status and evidence.
 * framework = AccountingStandard for multi-GAAP filtering and per-GAAP default topic sets.
 */

import type { AccountingStandard } from '../constants/accounting/index.js';

export type DisclosureItemStatus = 'not_started' | 'in_progress' | 'reviewed' | 'complete';

export interface DisclosureItem {
  id: string;
  standard: string; // citation e.g. "ASC 205", "IAS 1"
  topic: string;
  description: string;
  status: DisclosureItemStatus;
  evidenceId?: string;
  evidenceType?: 'reconciliation' | 'document' | 'checklist_sign_off';
  periodLabel: string;
  assignee?: string;
  dueDate?: string; // ISO
  /** GAAP framework for filtering and seeding (US_GAAP, IFRS, ASPE, FRS102). */
  framework?: AccountingStandard;
}
