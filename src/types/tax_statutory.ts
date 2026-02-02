/**
 * Tax provision workflow, statutory vs management, filing calendar.
 */

export interface TaxProvisionInput {
  periodLabel: string;
  pretaxIncome: number;
  /** Statutory rate (e.g. 0.21 for US federal) */
  statutoryRate: number;
  /** Current tax expense (from prior estimate or return) */
  currentTaxExpense?: number;
  /** Deferred tax movements */
  deferredTaxAssetStart?: number;
  deferredTaxLiabilityStart?: number;
  deferredTaxMovement?: number;
}

export interface TaxProvisionResult {
  periodLabel: string;
  currentTaxExpense: number;
  deferredTaxExpense: number;
  totalTaxExpense: number;
  effectiveRate: number;
  rateReconciliation?: { description: string; amount: number }[];
  /** FW3: prior-year return figures for tie-out */
  priorYearReturnFigures?: { currentTaxPaid?: number; deferredTaxBalance?: number; other?: Record<string, number> };
  /** FW3: deferred tax rollforward (opening + P&L movement + other = closing) */
  deferredTaxRollforward?: { openingBalance: number; plMovement: number; other: number; closingBalance: number };
}

export interface FilingCalendarItem {
  id: string;
  type: 'tax' | 'statutory' | 'covenant' | 'other';
  name: string;
  dueDate: string; // ISO
  entityId?: string;
  jurisdiction?: string;
  status?: 'pending' | 'filed' | 'extended';
  /** FW3: recurrence and reminders */
  recurrence?: 'once' | 'annual' | 'quarterly' | 'monthly';
  reminderDays?: number; // e.g. 30 = remind 30 days before due
}

export type TaxReturnStatus = 'draft' | 'in_review' | 'filed' | 'extended';
export type TaxReturnType = 'income_tax' | 'vat' | 'other';

export interface TaxReturn {
  id: string;
  entityId: string;
  jurisdiction: string;
  periodLabel: string;
  type: TaxReturnType;
  status: TaxReturnStatus;
  dueDate: string; // ISO
  filedAt?: string; // ISO
  provisionSnapshot?: Record<string, unknown>;
  priorYearFigures?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}
