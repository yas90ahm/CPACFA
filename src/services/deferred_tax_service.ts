/**
 * Deferred tax service — temporary differences, DTA/DTL, valuation allowance, rate changes (IAS 12 / ASC 740).
 */

import type { Pool } from 'pg';
import * as repo from '../db/repositories/deferred_tax_repository.js';
import type { DeferredTaxItemRow, ValuationAllowanceRow, RateChangeRow } from '../db/repositories/deferred_tax_repository.js';
import { round2 } from '../utils/decimal.js';

// Re-export types
export type { DeferredTaxItemRow, ValuationAllowanceRow, RateChangeRow };

// ============================================================================
// Temporary Difference Types
// ============================================================================

export interface TemporaryDifference {
  description: string;
  bookBasis: number;
  taxBasis: number;
  temporaryDifference: number; // book - tax
  reversalPattern: '1_year' | '2_5_years' | 'indefinite';
  sourceAccount?: string;
}

export interface DeferredTaxResult {
  periodLabel: string;
  temporaryDifferences: TemporaryDifference[];
  deferredTaxAssetGross: number;
  deferredTaxLiabilityGross: number;
  valuationAllowance: number;
  deferredTaxAssetNet: number;
  deferredTaxLiabilityNet: number;
  netDeferredTaxAsset: number; // positive = asset, negative = liability
}

// ============================================================================
// Calculate Deferred Tax Position
// ============================================================================

/**
 * Calculate deferred tax position from temporary differences.
 */
export async function calculateDeferredTax(
  tenantId: string,
  pool: Pool,
  periodLabel: string,
  taxRate: number
): Promise<DeferredTaxResult> {
  const items = await repo.listDeferredTaxItems(pool, tenantId, periodLabel);
  
  let deferredTaxAssetGross = 0;
  let deferredTaxLiabilityGross = 0;
  
  const temporaryDifferences: TemporaryDifference[] = [];
  
  for (const item of items) {
    if (item.itemType === 'temporary_difference') {
      const bookBasis = item.bookBasis ?? 0;
      const taxBasis = item.taxBasis ?? 0;
      const tempDiff = bookBasis - taxBasis;
      const deferredTax = Math.abs(tempDiff) * taxRate;
      
      temporaryDifferences.push({
        description: item.description,
        bookBasis,
        taxBasis,
        temporaryDifference: tempDiff,
        reversalPattern: item.reversalPattern ?? '2_5_years',
        sourceAccount: item.sourceAccount,
      });
      
      // Positive temp diff (book > tax) = deductible = DTA (e.g., accrued expenses)
      // Negative temp diff (book < tax) = taxable = DTL (e.g., accelerated depreciation)
      if (tempDiff > 0) {
        deferredTaxAssetGross += deferredTax;
      } else {
        deferredTaxLiabilityGross += deferredTax;
      }
    } else if (item.itemType === 'nol_carryforward' || item.itemType === 'tax_credit') {
      // NOL and tax credits are assets
      deferredTaxAssetGross += item.deferredTaxAsset ?? 0;
    }
  }
  
  // Get valuation allowance if exists
  const allowances = await repo.listValuationAllowances(pool, tenantId, periodLabel);
  const latestAllowance = allowances[0];
  const valuationAllowance = latestAllowance?.valuationAllowance ?? 0;
  
  const deferredTaxAssetNet = deferredTaxAssetGross - valuationAllowance;
  const deferredTaxLiabilityNet = deferredTaxLiabilityGross;
  const netDeferredTaxAsset = deferredTaxAssetNet - deferredTaxLiabilityNet;
  
  return {
    periodLabel,
    temporaryDifferences,
    deferredTaxAssetGross: round2(deferredTaxAssetGross),
    deferredTaxLiabilityGross: round2(deferredTaxLiabilityGross),
    valuationAllowance: round2(valuationAllowance),
    deferredTaxAssetNet: round2(deferredTaxAssetNet),
    deferredTaxLiabilityNet: round2(deferredTaxLiabilityNet),
    netDeferredTaxAsset: round2(netDeferredTaxAsset),
  };
}

// ============================================================================
// Valuation Allowance Assessment
// ============================================================================

export interface ValuationAllowanceAssessment {
  valuationAllowance: number;
  assessment: 'fully_realizable' | 'partial_allowance' | 'full_allowance';
  rationale: string;
  factors: {
    positive: string[];
    negative: string[];
  };
}

/** Minimal evidence required before computing allowance: projected taxable income and/or NOL/history. */
export interface ValuationAllowanceEvidence {
  /** Projected taxable income by period (e.g. next 1–3 years). Required when DTA > 0 unless NOL/history provided. */
  projectedTaxableIncome: number[];
  /** NOL carryforward amount (if any). */
  nolCarryforwardAmount?: number;
  /** NOL expiry date or description (if applicable). */
  nolExpiry?: string;
  /** Prior 2–3 years P&L / taxable income for history. */
  plHistory?: number[];
}

const INSUFFICIENT_EVIDENCE_MSG =
  'Insufficient evidence: provide projected taxable income and NOL/history before computing valuation allowance.';

/**
 * Require at least minimal evidence when DTA > 0: projected taxable income (non-empty) or NOL/history.
 */
export function requireValuationAllowanceEvidence(
  deferredTaxAssetGross: number,
  evidence: ValuationAllowanceEvidence
): void {
  if (deferredTaxAssetGross <= 0) return;
  const hasProjectedIncome =
    Array.isArray(evidence.projectedTaxableIncome) && evidence.projectedTaxableIncome.length > 0;
  const hasNol = evidence.nolCarryforwardAmount != null || (evidence.nolExpiry != null && evidence.nolExpiry.trim() !== '');
  const hasHistory = Array.isArray(evidence.plHistory) && evidence.plHistory.length > 0;
  if (!hasProjectedIncome && !hasNol && !hasHistory) {
    throw new Error(INSUFFICIENT_EVIDENCE_MSG);
  }
}

/**
 * Assess valuation allowance based on "more likely than not" criterion.
 * Requires minimal evidence (projected taxable income and/or NOL/history) when DTA > 0.
 * Persists assessment and rationale to DB for audit.
 */
export async function assessValuationAllowance(
  tenantId: string,
  pool: Pool,
  periodLabel: string,
  deferredTaxAssetGross: number,
  evidence: ValuationAllowanceEvidence
): Promise<ValuationAllowanceAssessment> {
  requireValuationAllowanceEvidence(deferredTaxAssetGross, evidence);

  const projectedTaxableIncome = evidence.projectedTaxableIncome ?? [];
  const totalProjectedIncome = projectedTaxableIncome.reduce((a, b) => a + b, 0);
  const positiveFactors: string[] = [];
  const negativeFactors: string[] = [];

  if (evidence.nolCarryforwardAmount != null && evidence.nolCarryforwardAmount > 0) {
    negativeFactors.push(`NOL carryforward: ${evidence.nolCarryforwardAmount}`);
    if (evidence.nolExpiry) negativeFactors.push(`NOL expiry: ${evidence.nolExpiry}`);
  } else {
    positiveFactors.push('No NOL carryforward');
  }

  if (evidence.plHistory && evidence.plHistory.length > 0) {
    const losses = evidence.plHistory.filter((x) => x < 0).length;
    if (losses > 0) negativeFactors.push(`${losses} year(s) of losses in recent history`);
    else positiveFactors.push('Positive P&L history');
  }

  if (totalProjectedIncome > deferredTaxAssetGross) {
    positiveFactors.push('Projected taxable income exceeds DTA');
  } else if (totalProjectedIncome > 0) {
    negativeFactors.push('Projected income may be insufficient to realize all DTAs');
  } else if (projectedTaxableIncome.length === 0 && (evidence.nolCarryforwardAmount == null || evidence.nolCarryforwardAmount <= 0)) {
    negativeFactors.push('No projected taxable income');
  } else if (totalProjectedIncome <= 0) {
    negativeFactors.push('No projected taxable income');
  }

  let valuationAllowance = 0;
  let assessment: ValuationAllowanceAssessment['assessment'] = 'fully_realizable';
  let rationale = '';

  if (negativeFactors.length === 0 && positiveFactors.length > 0) {
    assessment = 'fully_realizable';
    rationale = 'Based on positive evidence, it is more likely than not that DTAs will be fully realized.';
  } else if (totalProjectedIncome <= 0 && deferredTaxAssetGross > 0) {
    assessment = 'full_allowance';
    valuationAllowance = deferredTaxAssetGross;
    rationale = 'Insufficient positive evidence to conclude realization is more likely than not.';
  } else if (totalProjectedIncome > 0 && totalProjectedIncome < deferredTaxAssetGross) {
    assessment = 'partial_allowance';
    valuationAllowance = deferredTaxAssetGross - totalProjectedIncome;
    rationale = 'Partial allowance recorded for portion of DTA that cannot be supported by projected income.';
  }

  const deferredTaxAssetNet = deferredTaxAssetGross - valuationAllowance;
  const result: ValuationAllowanceAssessment = {
    valuationAllowance: round2(valuationAllowance),
    assessment,
    rationale,
    factors: { positive: positiveFactors, negative: negativeFactors },
  };

  await repo.createValuationAllowance(pool, tenantId, {
    periodLabel,
    deferredTaxAssetGross,
    valuationAllowance: result.valuationAllowance,
    deferredTaxAssetNet: round2(deferredTaxAssetNet),
    assessment: result.assessment,
    factors: {
      positiveSources: result.factors.positive,
      negativeSources: result.factors.negative,
      rationale: result.rationale,
    },
  });

  return result;
}

// ============================================================================
// Rate Change Impact
// ============================================================================

export interface RateChangeImpact {
  oldDeferredTax: number;
  newDeferredTax: number;
  impactAmount: number;
  impactDirection: 'benefit' | 'expense';
}

/**
 * Calculate impact of tax rate change on deferred tax balances.
 */
export function calculateRateChangeImpact(
  deferredTaxAssetGross: number,
  deferredTaxLiabilityGross: number,
  oldRate: number,
  newRate: number
): RateChangeImpact {
  // DTA and DTL were calculated at old rate, need to remeasure at new rate
  const rateRatio = newRate / oldRate;
  const newDTAGross = deferredTaxAssetGross * rateRatio;
  const newDTLGross = deferredTaxLiabilityGross * rateRatio;
  
  const oldNetDeferredTax = deferredTaxAssetGross - deferredTaxLiabilityGross;
  const newNetDeferredTax = newDTAGross - newDTLGross;
  
  const impactAmount = newNetDeferredTax - oldNetDeferredTax;
  
  return {
    oldDeferredTax: oldNetDeferredTax,
    newDeferredTax: newNetDeferredTax,
    impactAmount: round2(impactAmount),
    impactDirection: impactAmount > 0 ? 'benefit' : 'expense',
  };
}

// ============================================================================
// CRUD Operations
// ============================================================================

export async function createDeferredTaxItem(
  tenantId: string,
  pool: Pool,
  item: Omit<DeferredTaxItemRow, 'id' | 'createdAt' | 'updatedAt' | 'tenantId'>
): Promise<DeferredTaxItemRow> {
  return repo.createDeferredTaxItem(pool, tenantId, item);
}

export async function listDeferredTaxItems(
  tenantId: string,
  pool: Pool,
  periodLabel?: string
): Promise<DeferredTaxItemRow[]> {
  return repo.listDeferredTaxItems(pool, tenantId, periodLabel);
}

export async function getDeferredTaxItem(tenantId: string, pool: Pool, id: string): Promise<DeferredTaxItemRow | null> {
  return repo.getDeferredTaxItem(pool, tenantId, id);
}

export async function updateDeferredTaxItem(
  tenantId: string,
  pool: Pool,
  id: string,
  patch: Partial<DeferredTaxItemRow>
): Promise<DeferredTaxItemRow | null> {
  return repo.updateDeferredTaxItem(pool, tenantId, id, patch);
}

export async function deleteDeferredTaxItem(tenantId: string, pool: Pool, id: string): Promise<boolean> {
  return repo.deleteDeferredTaxItem(pool, tenantId, id);
}

export async function createValuationAllowance(
  tenantId: string,
  pool: Pool,
  allowance: Omit<ValuationAllowanceRow, 'id' | 'createdAt' | 'tenantId'>
): Promise<ValuationAllowanceRow> {
  return repo.createValuationAllowance(pool, tenantId, allowance);
}

export async function listValuationAllowances(
  tenantId: string,
  pool: Pool,
  periodLabel?: string
): Promise<ValuationAllowanceRow[]> {
  return repo.listValuationAllowances(pool, tenantId, periodLabel);
}

export async function createRateChange(
  tenantId: string,
  pool: Pool,
  rateChange: Omit<RateChangeRow, 'id' | 'createdAt' | 'tenantId'>
): Promise<RateChangeRow> {
  return repo.createRateChange(pool, tenantId, rateChange);
}

export async function listRateChanges(tenantId: string, pool: Pool): Promise<RateChangeRow[]> {
  return repo.listRateChanges(pool, tenantId);
}
