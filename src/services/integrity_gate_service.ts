/**
 * Integrity gate — Zero-variance policy: TB revenue vs contract revenue.
 * All currency math via decimal.js. Throws IntegrityGateViolation when variance exceeds tolerance.
 */

import { from } from '../utils/decimal.js';
import type { IntegrityGateInput, IntegrityGateResult, IntegrityContractFact } from '../types/integrity.js';
import { IntegrityGateViolation } from '../types/integrity.js';
import type { TrialBalanceEntry } from '../types/financial.js';

const DEFAULT_TOLERANCE = 0;

/**
 * Compute TB revenue from classified entries (REVENUE type: credit - debit).
 */
function tbRevenueFromEntries(entries: TrialBalanceEntry[]): number {
  let sum = from(0);
  for (const e of entries) {
    if (e.accountType !== 'REVENUE') continue;
    const net = from(e.credit).minus(e.debit);
    sum = sum.plus(net);
  }
  return sum.toDecimalPlaces(2).toNumber();
}

/**
 * Compute contract revenue: sum of totalContractValue, or periodRecognizedRevenue when available.
 */
function contractRevenueFromContracts(contracts: IntegrityContractFact[]): number {
  let sum = from(0);
  for (const c of contracts) {
    const amt = c.periodRecognizedRevenue != null ? c.periodRecognizedRevenue : c.totalContractValue;
    sum = sum.plus(amt);
  }
  return sum.toDecimalPlaces(2).toNumber();
}

/**
 * Run integrity gate: TB revenue vs contract revenue. Throws IntegrityGateViolation if variance > tolerance.
 */
export function runIntegrityGate(input: IntegrityGateInput): IntegrityGateResult {
  const tolerance = input.tolerance ?? DEFAULT_TOLERANCE;
  const tbRevenue = tbRevenueFromEntries(input.trialBalanceEntries);
  const contractRevenue = contractRevenueFromContracts(input.contracts);
  const variance = from(tbRevenue).minus(contractRevenue).abs().toNumber();

  if (from(variance).greaterThan(tolerance)) {
    throw new IntegrityGateViolation(
      `Trial Balance revenue $${tbRevenue.toFixed(2)} vs Contract revenue $${contractRevenue.toFixed(2)} exceeds allowed variance (tolerance=${tolerance}).`,
      tbRevenue,
      contractRevenue,
      variance
    );
  }

  return {
    passed: true,
    tbRevenue,
    contractRevenue,
    variance,
  };
}
