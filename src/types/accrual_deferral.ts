/**
 * Accrual and deferral suggestions for period-end close.
 */

export type AccrualDeferralType = 'accrual' | 'deferral';

export interface AccrualSuggestion {
  id: string;
  type: AccrualDeferralType;
  /** e.g. "Revenue accrual", "Expense accrual", "Prepaid expense deferral" */
  description: string;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  periodEnd: string; // ISO date
  /** Source: open AR/AP, payroll, or manual */
  source: 'open_ar' | 'open_ap' | 'payroll' | 'manual' | 'agentic';
  sourceDetail?: string;
  confidence?: number;
}

export interface AccrualSuggestionInput {
  periodEnd: string; // ISO
  /** Open AR (unbilled or not yet recorded) */
  openArAmount?: number;
  /** Open AP (invoices not yet recorded) */
  openApAmount?: number;
  /** Payroll accrual amount (from payroll pipeline) */
  payrollAccrualAmount?: number;
  /** Additional context for agentic suggestion */
  context?: string;
}
