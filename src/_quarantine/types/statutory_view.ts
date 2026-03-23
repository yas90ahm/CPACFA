/**
 * Statutory vs management view and reconciliation.
 */

export interface ManagementStatutoryLine {
  label: string;
  managementAmount: number;
  statutoryAmount: number;
  difference: number;
  differencePercent?: number;
}

export interface StatutoryReconciliationInput {
  periodLabel: string;
  /** Management view: line label -> amount */
  managementLines: { label: string; amount: number }[];
  /** Statutory view: same labels (or mapping) -> amount */
  statutoryLines: { label: string; amount: number }[];
}

export interface StatutoryReconciliationResult {
  periodLabel: string;
  lines: ManagementStatutoryLine[];
  totalManagement?: number;
  totalStatutory?: number;
  totalDifference?: number;
  narrative?: string;
}
