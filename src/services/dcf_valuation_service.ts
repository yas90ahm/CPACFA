/**
 * DCF valuation service — cash flow projection, WACC, terminal value, sensitivity analysis.
 */

import type { Pool } from 'pg';
import * as repo from '../db/repositories/dcf_repository.js';
import type { DCFModelRow, WACCCalculationRow, DCFSensitivityRow } from '../db/repositories/dcf_repository.js';
import { round2, round4 } from '../utils/decimal.js';

// Re-export types
export type { DCFModelRow, WACCCalculationRow, DCFSensitivityRow };

// ============================================================================
// WACC Calculation
// ============================================================================

export interface WACCInput {
  riskFreeRate: number;
  beta: number;
  marketRiskPremium: number;
  costOfDebt: number;
  taxRate: number;
  debtWeight: number;
  equityWeight: number;
}

/**
 * Calculate Weighted Average Cost of Capital (WACC).
 */
export function calculateWACC(input: WACCInput): number {
  // Cost of equity using CAPM
  const costOfEquity = input.riskFreeRate + input.beta * input.marketRiskPremium;
  
  // After-tax cost of debt
  const afterTaxCostOfDebt = input.costOfDebt * (1 - input.taxRate);
  
  // WACC
  const wacc = input.equityWeight * costOfEquity + input.debtWeight * afterTaxCostOfDebt;
  
  return round4(wacc);
}

// ============================================================================
// DCF Calculation
// ============================================================================

export interface DCFInput {
  companyName: string;
  cashFlows: number[]; // projected free cash flows
  terminalGrowthRate: number;
  wacc: number;
  netDebt: number;
  sharesOutstanding: number;
}

export interface DCFResult {
  companyName: string;
  projectionYears: number;
  cashFlows: Array<{ year: number; fcf: number }>;
  wacc: number;
  terminalGrowthRate: number;
  pvCashFlows: number;
  terminalValue: number;
  pvTerminalValue: number;
  enterpriseValue: number;
  netDebt: number;
  equityValue: number;
  sharesOutstanding: number;
  valuePerShare: number;
}

/** Error thrown when Gordon growth model inputs are invalid (WACC must exceed terminal growth rate). */
export const DCF_GORDON_VALIDATION_ERROR = 'DCF Gordon model requires WACC to exceed terminal growth rate.';

/** Long-term terminal growth cap (e.g. nominal GDP); Gordon model assumes g < r. */
const TERMINAL_GROWTH_CAP = 0.15;

/**
 * Calculate DCF valuation using mid-year convention.
 * Discount factor: (1 + r)^(n - 0.5) for FCF and terminal value.
 * Gordon growth model assumes g < r (ASC 805 / valuation practice); invalid inputs throw.
 */
export function calculateDCF(input: DCFInput): DCFResult {
  const { companyName, cashFlows, terminalGrowthRate, wacc, netDebt, sharesOutstanding } = input;

  if (wacc <= terminalGrowthRate) {
    throw new Error(DCF_GORDON_VALIDATION_ERROR);
  }
  if (terminalGrowthRate > TERMINAL_GROWTH_CAP) {
    throw new Error(
      `Terminal growth rate must not exceed ${TERMINAL_GROWTH_CAP * 100}% (long-term growth cap).`
    );
  }

  // PV of projection period: mid-year convention — discount at (1 + wacc)^(year - 0.5)
  let pvCashFlows = 0;
  const cashFlowsWithYear: Array<{ year: number; fcf: number }> = [];
  
  for (let i = 0; i < cashFlows.length; i++) {
    const year = i + 1;
    const fcf = cashFlows[i];
    const pv = fcf / Math.pow(1 + wacc, year - 0.5);
    pvCashFlows += pv;
    cashFlowsWithYear.push({ year, fcf });
  }
  
  // Terminal value (Gordon Growth Model); valued at same point as last FCF (mid-year of year n)
  const lastCashFlow = cashFlows[cashFlows.length - 1];
  const terminalCashFlow = lastCashFlow * (1 + terminalGrowthRate);
  const terminalValue = terminalCashFlow / (wacc - terminalGrowthRate);
  
  // PV of terminal value: mid-year convention — discount at (1 + wacc)^(n - 0.5)
  const n = cashFlows.length;
  const pvTerminalValue = terminalValue / Math.pow(1 + wacc, n - 0.5);
  
  // Enterprise Value = PV of cash flows + PV of terminal value
  const enterpriseValue = pvCashFlows + pvTerminalValue;
  
  // Equity Value = Enterprise Value - Net Debt
  const equityValue = enterpriseValue - netDebt;
  
  // Value per share
  const valuePerShare = sharesOutstanding > 0 ? equityValue / sharesOutstanding : 0;
  
  return {
    companyName,
    projectionYears: cashFlows.length,
    cashFlows: cashFlowsWithYear,
    wacc,
    terminalGrowthRate,
    pvCashFlows: round2(pvCashFlows),
    terminalValue: round2(terminalValue),
    pvTerminalValue: round2(pvTerminalValue),
    enterpriseValue: round2(enterpriseValue),
    netDebt,
    equityValue: round2(equityValue),
    sharesOutstanding,
    valuePerShare: round2(valuePerShare),
  };
}

// ============================================================================
// Sensitivity Analysis
// ============================================================================

export interface SensitivityInput {
  baseCashFlows: number[];
  baseWACC: number;
  baseGrowthRate: number;
  netDebt: number;
  sharesOutstanding: number;
  waccRange?: number[]; // e.g., [0.08, 0.09, 0.10, 0.11, 0.12]
  growthRange?: number[]; // e.g., [0.01, 0.015, 0.02, 0.025, 0.03]
}

export interface SensitivityResult {
  waccValues: number[];
  growthValues: number[];
  valueMatrix: number[][]; // [growthIndex][waccIndex] = value per share
  baseCase: { wacc: number; growth: number; valuePerShare: number };
}

/**
 * Perform sensitivity analysis on DCF model.
 */
export function performSensitivityAnalysis(input: SensitivityInput): SensitivityResult {
  const waccValues = input.waccRange ?? [input.baseWACC - 0.02, input.baseWACC - 0.01, input.baseWACC, input.baseWACC + 0.01, input.baseWACC + 0.02];
  const growthValues = input.growthRange ?? [input.baseGrowthRate - 0.01, input.baseGrowthRate - 0.005, input.baseGrowthRate, input.baseGrowthRate + 0.005, input.baseGrowthRate + 0.01];
  
  const valueMatrix: number[][] = [];
  
  for (const growth of growthValues) {
    const row: number[] = [];
    for (const wacc of waccValues) {
      if (wacc <= growth) {
        // Invalid: WACC must be > growth rate for perpetuity
        row.push(0);
      } else {
        const result = calculateDCF({
          companyName: '',
          cashFlows: input.baseCashFlows,
          terminalGrowthRate: growth,
          wacc,
          netDebt: input.netDebt,
          sharesOutstanding: input.sharesOutstanding,
        });
        row.push(result.valuePerShare);
      }
    }
    valueMatrix.push(row);
  }
  
  // Base case
  const baseResult = calculateDCF({
    companyName: '',
    cashFlows: input.baseCashFlows,
    terminalGrowthRate: input.baseGrowthRate,
    wacc: input.baseWACC,
    netDebt: input.netDebt,
    sharesOutstanding: input.sharesOutstanding,
  });
  
  return {
    waccValues,
    growthValues,
    valueMatrix,
    baseCase: {
      wacc: input.baseWACC,
      growth: input.baseGrowthRate,
      valuePerShare: baseResult.valuePerShare,
    },
  };
}

// ============================================================================
// CRUD Operations with Persistence
// ============================================================================

export async function saveDCFModel(
  tenantId: string,
  pool: Pool,
  input: DCFInput,
  assumptions?: { revenueGrowth?: number[]; margins?: number[]; capex?: number[] }
): Promise<DCFModelRow> {
  const result = calculateDCF(input);
  return repo.createDCFModel(pool, tenantId, {
    companyName: result.companyName,
    valuationDate: new Date().toISOString().slice(0, 10),
    projectionYears: result.projectionYears,
    terminalGrowthRate: result.terminalGrowthRate,
    wacc: result.wacc,
    cashFlows: result.cashFlows,
    terminalValue: result.terminalValue,
    pvCashFlows: result.pvCashFlows,
    pvTerminalValue: result.pvTerminalValue,
    enterpriseValue: result.enterpriseValue,
    netDebt: result.netDebt,
    equityValue: result.equityValue,
    sharesOutstanding: result.sharesOutstanding,
    valuePerShare: result.valuePerShare,
    assumptions,
  });
}

export async function getDCFModel(tenantId: string, pool: Pool, id: string): Promise<DCFModelRow | null> {
  return repo.getDCFModel(pool, tenantId, id);
}

export async function listDCFModels(tenantId: string, pool: Pool): Promise<DCFModelRow[]> {
  return repo.listDCFModels(pool, tenantId);
}

export async function deleteDCFModel(tenantId: string, pool: Pool, id: string): Promise<boolean> {
  return repo.deleteDCFModel(pool, tenantId, id);
}

export async function saveWACCCalculation(
  tenantId: string,
  pool: Pool,
  input: WACCInput,
  dcfModelId?: string,
  rationale?: string
): Promise<WACCCalculationRow> {
  const costOfEquity = input.riskFreeRate + input.beta * input.marketRiskPremium;
  const wacc = calculateWACC(input);
  return repo.createWACCCalculation(pool, tenantId, {
    dcfModelId,
    costOfEquity,
    costOfDebt: input.costOfDebt,
    marketRiskPremium: input.marketRiskPremium,
    riskFreeRate: input.riskFreeRate,
    beta: input.beta,
    taxRate: input.taxRate,
    debtWeight: input.debtWeight,
    equityWeight: input.equityWeight,
    wacc,
    rationale,
  });
}

export async function listWACCCalculations(tenantId: string, pool: Pool, dcfModelId?: string): Promise<WACCCalculationRow[]> {
  return repo.listWACCCalculations(pool, tenantId, dcfModelId);
}

export async function saveSensitivityAnalysis(
  tenantId: string,
  pool: Pool,
  dcfModelId: string,
  result: SensitivityResult
): Promise<DCFSensitivityRow> {
  return repo.createSensitivity(pool, tenantId, {
    dcfModelId,
    waccValues: result.waccValues,
    growthValues: result.growthValues,
    valueMatrix: result.valueMatrix,
  });
}

export async function getSensitivityAnalysis(tenantId: string, pool: Pool, dcfModelId: string): Promise<DCFSensitivityRow | null> {
  return repo.getSensitivity(pool, tenantId, dcfModelId);
}
