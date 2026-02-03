/**
 * Month-end close: JE suggestions (from gaps/reconciliation), checklist, period lock.
 */

import type { DataGap } from '../agents/cpa_brain.js';
import type { ReconciliationMismatch } from '../types/orchestrator.js';
import type {
  JournalEntrySuggestion,
  CloseChecklistStep,
  PeriodLock,
} from '../types/close_and_controls.js';

const DEFAULT_CHECKLIST_SPECS: { label: string; controlId?: string }[] = [
  { label: 'Reconcile bank', controlId: 'bank_rec' },
  { label: 'Reconcile AR/AP subledgers', controlId: 'ar_ap_rec' },
  { label: 'Review accruals and deferrals', controlId: 'accruals_review' },
  { label: 'Run depreciation', controlId: 'depreciation' },
  { label: 'Close P&L and post to retained earnings', controlId: 'pl_close' },
  { label: 'Reconcile TB and BS', controlId: 'tb_bs_rec' },
  { label: 'Lock period', controlId: 'period_lock' },
];

/** Build JE suggestions from data gaps and reconciliation mismatches */
export function buildJournalEntrySuggestions(
  gaps: DataGap[],
  mismatches: ReconciliationMismatch[]
): JournalEntrySuggestion[] {
  const suggestions: JournalEntrySuggestion[] = [];
  let id = 0;
  for (const gap of gaps) {
    if (gap.type === 'missing_liability' || gap.type === 'missing_asset') {
      suggestions.push({
        id: `je-gap-${++id}`,
        date: new Date().toISOString().slice(0, 10),
        description: gap.title ?? gap.description ?? 'Adjustment for gap',
        debits: gap.type === 'missing_asset' ? [{ account: 'TBD', amount: 0 }] : [],
        credits: gap.type === 'missing_liability' ? [{ account: 'TBD', amount: 0 }] : [],
        source: 'gap',
        sourceDetail: gap.suggestion,
        confidence: 0.5,
      });
    }
  }
  for (const m of mismatches) {
    if (m.type === 'trial_balance') {
      suggestions.push({
        id: `je-rec-${++id}`,
        date: new Date().toISOString().slice(0, 10),
        description: m.message,
        debits: [],
        credits: [],
        source: 'reconciliation',
        sourceDetail: m.detail,
        confidence: 0.6,
      });
    }
    if (m.type === 'bank_reconciliation') {
      suggestions.push({
        id: `je-bank-${++id}`,
        date: new Date().toISOString().slice(0, 10),
        description: 'Bank reconciliation adjustment',
        debits: [{ account: 'Cash', amount: 0 }],
        credits: [],
        source: 'reconciliation',
        sourceDetail: m.detail,
        confidence: 0.7,
      });
    }
  }
  return suggestions;
}

/** Create default close checklist for a period (with controlId for audit trail) */
export function createCloseChecklist(
  periodLabel: string,
  options?: { assignee?: string; dueDate?: string }
): CloseChecklistStep[] {
  return DEFAULT_CHECKLIST_SPECS.map((spec, i) => ({
    id: `step-${i + 1}`,
    label: spec.label,
    category: spec.category,
    verificationMethod: spec.verificationMethod,
    status: 'pending' as const,
    controlId: spec.controlId,
    assignee: options?.assignee,
    dueDate: options?.dueDate,
  }));
}
