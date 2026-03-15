/**
 * Intercompany pairs and reconciliation results.
 */

export interface IntercompanyPair {
  id: string;
  entityAId: string;
  entityBId: string;
  /** TB account name for IC receivable (entity A) */
  accountNameA: string;
  /** TB account name for IC payable (entity B) */
  accountNameB: string;
  name?: string;
  createdAt?: string;
}

export type IntercompanyReconciliationStatus = 'matched' | 'variance' | 'missing';

export interface IntercompanyReconciliationResult {
  id: string;
  tenantId: string;
  pairId: string;
  periodLabel: string;
  /** Matched amount (min of A balance and B balance when both present) */
  matchedAmount: string;
  /** Entity A balance (IC receivable) */
  balanceA: string;
  /** Entity B balance (IC payable) */
  balanceB: string;
  variance: string;
  status: IntercompanyReconciliationStatus;
  varianceDetail?: string;
  resolution?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IntercompanyReconciliationInput {
  periodLabel: string;
  pairId: string;
  entityALines: { accountName: string; amount: number; side: 'debit' | 'credit' }[];
  entityBLines: { accountName: string; amount: number; side: 'debit' | 'credit' }[];
}
