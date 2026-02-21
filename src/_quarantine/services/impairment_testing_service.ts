/**
 * Impairment testing service — CGUs, goodwill, value in use, fair value less costs (IAS 36 / ASC 350).
 */

import type { Pool } from 'pg';
import { round2 } from '../utils/decimal.js';
import * as repo from '../db/repositories/impairment_repository.js';
import type { CGURow, GoodwillAllocationRow, ImpairmentTestRow } from '../db/repositories/impairment_repository.js';

// Re-export types
export type { CGURow, GoodwillAllocationRow, ImpairmentTestRow };

// ============================================================================
// Value in Use Calculation (DCF)
// ============================================================================

/**
 * Calculate Value in Use using DCF methodology.
 */
export function calculateValueInUse(
  cashFlows: number[],
  discountRate: number,
  terminalGrowthRate: number = 0
): number {
  let presentValue = 0;
  
  // Discount projected cash flows
  for (let i = 0; i < cashFlows.length; i++) {
    const pv = cashFlows[i] / Math.pow(1 + discountRate, i + 1);
    presentValue += pv;
  }
  
  // Terminal value (perpetuity growth model)
  if (terminalGrowthRate > 0 && cashFlows.length > 0) {
    const lastCashFlow = cashFlows[cashFlows.length - 1];
    const terminalCashFlow = lastCashFlow * (1 + terminalGrowthRate);
    const terminalValue = terminalCashFlow / (discountRate - terminalGrowthRate);
    const pvTerminal = terminalValue / Math.pow(1 + discountRate, cashFlows.length);
    presentValue += pvTerminal;
  }
  
  return round2(presentValue);
}

// ============================================================================
// Impairment Test
// ============================================================================

export interface ImpairmentTestInput {
  cguId?: string;
  periodLabel: string;
  assetType: 'goodwill' | 'intangible' | 'ppe' | 'investment';
  assetDescription?: string;
  carryingAmount: number;
  method: 'value_in_use' | 'fair_value_less_costs';
  cashFlows?: number[]; // projected cash flows for value in use
  discountRate?: number;
  terminalGrowthRate?: number;
  fairValue?: number; // for fair value method
  costsToSell?: number;
}

export interface ImpairmentTestResult {
  cguId?: string;
  cguName?: string;
  assetType: string;
  carryingAmount: number;
  recoverableAmount: number;
  impairmentLoss: number;
  impairmentRequired: boolean;
  method: string;
  assumptions: {
    discountRate?: number;
    terminalGrowthRate?: number;
    cashFlows?: number[];
    fairValue?: number;
    costsToSell?: number;
    /** When both VIU and FVLCS performed: which was used for recoverable amount. */
    recoverableAmountSource?: 'value_in_use' | 'fair_value_less_costs' | 'both_higher_used';
    /** Document when only one method performed. */
    otherMethodNotPerformed?: string;
  };
}

/**
 * Perform impairment test and calculate impairment loss if any.
 * When both VIU inputs (cashFlows, discountRate) and FVLCS inputs (fairValue, costsToSell) are provided,
 * recoverable amount = max(VIU, FVLCS) per IAS 36 / ASC 350.
 */
export async function performImpairmentTest(
  tenantId: string,
  pool: Pool,
  input: ImpairmentTestInput
): Promise<ImpairmentTestResult> {
  const assumptions: ImpairmentTestResult['assumptions'] = {};
  let cguName: string | undefined;

  if (input.cguId) {
    const cgu = await repo.getCGU(pool, tenantId, input.cguId);
    cguName = cgu?.cguName;
  }

  const hasVIU = input.cashFlows != null && input.cashFlows.length > 0 && input.discountRate != null;
  const hasFVLCS = input.fairValue != null;

  let valueInUse: number | undefined;
  let fvlcs: number | undefined;

  if (hasVIU) {
    valueInUse = calculateValueInUse(
      input.cashFlows!,
      input.discountRate!,
      input.terminalGrowthRate ?? 0
    );
    assumptions.discountRate = input.discountRate;
    assumptions.terminalGrowthRate = input.terminalGrowthRate;
    assumptions.cashFlows = input.cashFlows;
  }
  if (hasFVLCS) {
    const costsToSell = input.costsToSell ?? 0;
    fvlcs = input.fairValue! - costsToSell;
    assumptions.fairValue = input.fairValue;
    assumptions.costsToSell = costsToSell;
  }

  if (!hasVIU && !hasFVLCS) {
    throw new Error('Provide either value-in-use inputs (cashFlows, discountRate) or fair-value-less-costs inputs (fairValue, costsToSell), or both.');
  }

  let recoverableAmount: number;
  let methodUsed: string;

  if (hasVIU && hasFVLCS) {
    recoverableAmount = Math.max(valueInUse!, fvlcs!);
    methodUsed = 'value_in_use_and_fair_value_less_costs';
    assumptions.recoverableAmountSource = 'both_higher_used';
  } else if (hasVIU) {
    recoverableAmount = valueInUse!;
    methodUsed = 'value_in_use';
    assumptions.otherMethodNotPerformed = 'Recoverable amount based on value in use only; fair value less costs to sell not performed.';
  } else {
    recoverableAmount = fvlcs!;
    methodUsed = 'fair_value_less_costs';
    assumptions.otherMethodNotPerformed = 'Recoverable amount based on fair value less costs to sell only; value in use not performed.';
  }

  const impairmentLoss = Math.max(0, input.carryingAmount - recoverableAmount);
  const impairmentRequired = impairmentLoss > 0;

  await repo.createImpairmentTest(pool, tenantId, {
    cguId: input.cguId,
    periodLabel: input.periodLabel,
    testDate: new Date().toISOString().slice(0, 10),
    assetType: input.assetType,
    assetDescription: input.assetDescription,
    carryingAmount: input.carryingAmount,
    recoverableAmount,
    impairmentLoss: impairmentRequired ? impairmentLoss : undefined,
    method: methodUsed as 'value_in_use' | 'fair_value_less_costs' | 'value_in_use_and_fair_value_less_costs',
    assumptions,
    quantitativeRequired: true,
  });

  return {
    cguId: input.cguId,
    cguName,
    assetType: input.assetType,
    carryingAmount: input.carryingAmount,
    recoverableAmount,
    impairmentLoss,
    impairmentRequired,
    method: methodUsed,
    assumptions,
  };
}

// ============================================================================
// Sensitivity Analysis
// ============================================================================

export interface SensitivityAnalysis {
  baseCase: { recoverableAmount: number; impairmentLoss: number };
  discountRateSensitivity: Array<{ rate: number; recoverableAmount: number; impairmentLoss: number }>;
  growthRateSensitivity: Array<{ rate: number; recoverableAmount: number; impairmentLoss: number }>;
  breakEvenDiscountRate?: number;
}

/**
 * Perform sensitivity analysis on impairment test.
 */
export function performSensitivityAnalysis(
  carryingAmount: number,
  cashFlows: number[],
  baseDiscountRate: number,
  baseGrowthRate: number
): SensitivityAnalysis {
  const baseRecoverable = calculateValueInUse(cashFlows, baseDiscountRate, baseGrowthRate);
  const baseImpairment = Math.max(0, carryingAmount - baseRecoverable);
  
  // Discount rate sensitivity (+/- 1%, 2%)
  const discountRateSensitivity = [-0.02, -0.01, 0.01, 0.02].map((delta) => {
    const rate = baseDiscountRate + delta;
    const recoverableAmount = calculateValueInUse(cashFlows, rate, baseGrowthRate);
    return {
      rate,
      recoverableAmount,
      impairmentLoss: Math.max(0, carryingAmount - recoverableAmount),
    };
  });
  
  // Growth rate sensitivity (+/- 0.5%, 1%)
  const growthRateSensitivity = [-0.01, -0.005, 0.005, 0.01].map((delta) => {
    const rate = Math.max(0, baseGrowthRate + delta);
    const recoverableAmount = calculateValueInUse(cashFlows, baseDiscountRate, rate);
    return {
      rate,
      recoverableAmount,
      impairmentLoss: Math.max(0, carryingAmount - recoverableAmount),
    };
  });
  
  // Find break-even discount rate
  let breakEvenDiscountRate: number | undefined;
  for (let testRate = baseDiscountRate; testRate < 0.5; testRate += 0.001) {
    const testRecoverable = calculateValueInUse(cashFlows, testRate, baseGrowthRate);
    if (testRecoverable < carryingAmount) {
      breakEvenDiscountRate = testRate;
      break;
    }
  }
  
  return {
    baseCase: { recoverableAmount: baseRecoverable, impairmentLoss: baseImpairment },
    discountRateSensitivity,
    growthRateSensitivity,
    breakEvenDiscountRate,
  };
}

// ============================================================================
// CRUD Operations
// ============================================================================

export async function createCGU(
  tenantId: string,
  pool: Pool,
  cgu: Omit<CGURow, 'id' | 'createdAt' | 'tenantId'>
): Promise<CGURow> {
  return repo.createCGU(pool, tenantId, cgu);
}

export async function getCGU(tenantId: string, pool: Pool, id: string): Promise<CGURow | null> {
  return repo.getCGU(pool, tenantId, id);
}

export async function listCGUs(tenantId: string, pool: Pool): Promise<CGURow[]> {
  return repo.listCGUs(pool, tenantId);
}

export async function deleteCGU(tenantId: string, pool: Pool, id: string): Promise<boolean> {
  return repo.deleteCGU(pool, tenantId, id);
}

export async function createGoodwillAllocation(
  tenantId: string,
  pool: Pool,
  allocation: Omit<GoodwillAllocationRow, 'id' | 'createdAt' | 'tenantId'>
): Promise<GoodwillAllocationRow> {
  return repo.createGoodwillAllocation(pool, tenantId, allocation);
}

export async function listGoodwillAllocations(tenantId: string, pool: Pool, cguId?: string): Promise<GoodwillAllocationRow[]> {
  return repo.listGoodwillAllocations(pool, tenantId, cguId);
}

export async function getTotalGoodwillForCGU(tenantId: string, pool: Pool, cguId: string): Promise<number> {
  return repo.getTotalGoodwillForCGU(pool, tenantId, cguId);
}

export async function getImpairmentTest(tenantId: string, pool: Pool, id: string): Promise<ImpairmentTestRow | null> {
  return repo.getImpairmentTest(pool, tenantId, id);
}

export async function listImpairmentTests(tenantId: string, pool: Pool, periodLabel?: string): Promise<ImpairmentTestRow[]> {
  return repo.listImpairmentTests(pool, tenantId, periodLabel);
}
