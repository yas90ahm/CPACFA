/**
 * GAAP-to-IFRS reconciliation bridge for consolidation (Scenario C).
 * Stub: pass-through with optional future LIFO/FIFO, lease accounting differences.
 * Consolidation can call reconcileEntityBalances before translateToReportingCurrency.
 */

export interface EntityBalanceLine {
  accountName: string;
  amount: number;
  side: 'debit' | 'credit';
  currency?: string;
  balanceType?: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
}

export interface GaapReconciliationAdjustment {
  reason: string;
  accountName: string;
  gaapAmount: number;
  ifrsAmount: number;
  citation?: string;
}

export interface GaapReconciliationResult {
  lines: EntityBalanceLine[];
  adjustments: GaapReconciliationAdjustment[];
  note?: string;
  /** Set when US_GAAP→IFRS and inventory/LIFO line detected (first conversion rule). */
  lifoInventoryFlag?: boolean;
}

/**
 * Reconcile entity balances from GAAP to IFRS (e.g. LIFO→FIFO, lease classification).
 * First conversion rule: US_GAAP→IFRS inventory; if inventory/LIFO line exists, add suggested
 * LIFO-to-FIFO adjustment (adjustments are suggested, not applied to lines).
 * Additional rules (lease classification, etc.) can be added later.
 */
export function reconcileEntityBalances(
  lines: EntityBalanceLine[],
  options?: { standardFrom?: 'US_GAAP'; standardTo?: 'IFRS' }
): GaapReconciliationResult {
  const adjustments: GaapReconciliationAdjustment[] = [];
  let lifoInventoryFlag = false;
  const noteParts: string[] = [];

  if (options?.standardFrom === 'US_GAAP' && options?.standardTo === 'IFRS') {
    const inventoryPattern = /inventory|LIFO|FIFO/i;
    const inventoryLine = lines.find((l) => inventoryPattern.test(l.accountName ?? ''));
    if (inventoryLine) {
      lifoInventoryFlag = true;
      const gaapAmount = inventoryLine.amount;
      adjustments.push({
        reason: 'LIFO to IFRS: Inventory may require FIFO adjustment for IFRS.',
        accountName: inventoryLine.accountName ?? 'Inventory',
        gaapAmount,
        ifrsAmount: gaapAmount, // placeholder; actual FIFO would require separate calculation
        citation: 'IAS 2.36',
      });
      noteParts.push('LIFO inventory detected; suggested FIFO adjustment per IAS 2.36 (adjustments are suggested, not applied).');
    }
  }

  const note =
    noteParts.length > 0
      ? noteParts.join(' ')
      : 'GAAP-to-IFRS reconciliation; no conversion rules applied for given options.';

  return {
    lines: [...lines],
    adjustments,
    note,
    ...(lifoInventoryFlag ? { lifoInventoryFlag: true } : {}),
  };
}
