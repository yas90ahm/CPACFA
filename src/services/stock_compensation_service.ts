/**
 * Stock-based compensation service — Black-Scholes, vesting schedules, expense recognition, dilution (IFRS 2 / ASC 718).
 */

import type { Pool } from 'pg';
import * as repo from '../db/repositories/stock_compensation_repository.js';
import type { StockGrantRow, VestingScheduleEntry } from '../db/repositories/stock_compensation_repository.js';
import { round2 } from '../utils/decimal.js';

// Re-export types
export type { StockGrantRow, VestingScheduleEntry };

// ============================================================================
// Black-Scholes Option Pricing
// ============================================================================

export interface BlackScholesParams {
  stockPrice: number;
  strikePrice: number;
  riskFreeRate: number; // annualized, e.g. 0.05 for 5%
  volatility: number; // annualized, e.g. 0.30 for 30%
  timeToExpiration: number; // years
  dividendYield?: number; // annualized, e.g. 0.02 for 2%
}

/** Standard normal CDF approximation (Abramowitz and Stegun) */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

/**
 * Calculate Black-Scholes call option fair value.
 */
export function calculateBlackScholes(params: BlackScholesParams): number {
  const { stockPrice, strikePrice, riskFreeRate, volatility, timeToExpiration, dividendYield = 0 } = params;
  if (timeToExpiration <= 0) return Math.max(0, stockPrice - strikePrice);
  const d1 = (Math.log(stockPrice / strikePrice) + (riskFreeRate - dividendYield + 0.5 * volatility * volatility) * timeToExpiration) / (volatility * Math.sqrt(timeToExpiration));
  const d2 = d1 - volatility * Math.sqrt(timeToExpiration);
  const callPrice = stockPrice * Math.exp(-dividendYield * timeToExpiration) * normalCDF(d1) - strikePrice * Math.exp(-riskFreeRate * timeToExpiration) * normalCDF(d2);
  return Math.max(0, callPrice);
}

// ============================================================================
// Vesting Schedule Generation
// ============================================================================

export interface VestingOptions {
  vestingPeriodMonths: number;
  cliffMonths?: number;
  vestingFrequency?: 'monthly' | 'quarterly' | 'annual';
}

/**
 * Generate a time-based vesting schedule.
 */
export function generateVestingSchedule(
  grantDate: string,
  sharesGranted: number,
  vestingType: 'time',
  options: VestingOptions
): VestingScheduleEntry[] {
  const { vestingPeriodMonths, cliffMonths = 0, vestingFrequency = 'monthly' } = options;
  const schedule: VestingScheduleEntry[] = [];
  const startDate = new Date(grantDate);
  
  const frequencyMonths = vestingFrequency === 'annual' ? 12 : vestingFrequency === 'quarterly' ? 3 : 1;
  const vestingEvents = Math.floor(vestingPeriodMonths / frequencyMonths);
  const sharesPerEvent = Math.floor(sharesGranted / vestingEvents);
  let remainingShares = sharesGranted;
  
  for (let i = 1; i <= vestingEvents; i++) {
    const eventMonths = i * frequencyMonths;
    const vestDate = new Date(startDate);
    vestDate.setMonth(vestDate.getMonth() + eventMonths);
    
    const isLastEvent = i === vestingEvents;
    const sharesToVest = isLastEvent ? remainingShares : sharesPerEvent;
    remainingShares -= sharesToVest;
    
    // Cliff: first vesting includes cliff shares
    const withinCliff = eventMonths < cliffMonths;
    
    schedule.push({
      date: vestDate.toISOString().slice(0, 10),
      shares: withinCliff ? 0 : sharesToVest,
      vested: false,
    });
  }
  
  // If cliff, accumulate shares to first post-cliff event
  if (cliffMonths > 0) {
    let cliffShares = 0;
    let firstPostCliffIdx = -1;
    for (let i = 0; i < schedule.length; i++) {
      const eventMonths = (i + 1) * frequencyMonths;
      if (eventMonths <= cliffMonths) {
        cliffShares += sharesPerEvent;
        schedule[i].shares = 0;
      } else if (firstPostCliffIdx < 0) {
        firstPostCliffIdx = i;
      }
    }
    if (firstPostCliffIdx >= 0) {
      schedule[firstPostCliffIdx].shares += cliffShares;
    }
  }
  
  return schedule;
}

// ============================================================================
// Expense Recognition
// ============================================================================

export interface ExpenseRecognitionResult {
  periodLabel: string;
  expenseAmount: number;
  cumulativeExpense: number;
  sharesVested: number;
  remainingExpense: number;
  totalGrantValue: number;
}

/**
 * Calculate stock compensation expense for a period.
 * Uses straight-line recognition over vesting period.
 */
export async function calculateExpenseRecognition(
  tenantId: string,
  pool: Pool,
  grantId: string,
  periodLabel: string
): Promise<ExpenseRecognitionResult> {
  const grant = await repo.getGrant(pool, tenantId, grantId);
  if (!grant) throw new Error(`Grant ${grantId} not found`);
  
  const fairValue = grant.fairValuePerShare ?? 0;
  const totalGrantValue = grant.sharesGranted * fairValue;
  
  // Parse period (assumes YYYY-MM format)
  const periodDate = new Date(periodLabel + '-01');
  const grantDateObj = new Date(grant.grantDate);
  
  // Count vesting months
  const schedule = grant.vestingSchedule;
  const lastVestDate = schedule.length > 0 ? new Date(schedule[schedule.length - 1].date) : grantDateObj;
  const totalVestingMonths = Math.max(1, (lastVestDate.getFullYear() - grantDateObj.getFullYear()) * 12 + (lastVestDate.getMonth() - grantDateObj.getMonth()));
  
  // Monthly expense (straight-line)
  const monthlyExpense = totalGrantValue / totalVestingMonths;
  
  // Calculate cumulative months from grant to period
  const monthsFromGrant = (periodDate.getFullYear() - grantDateObj.getFullYear()) * 12 + (periodDate.getMonth() - grantDateObj.getMonth());
  
  if (monthsFromGrant < 0) {
    return { periodLabel, expenseAmount: 0, cumulativeExpense: 0, sharesVested: 0, remainingExpense: totalGrantValue, totalGrantValue };
  }
  
  const cumulativeMonths = Math.min(monthsFromGrant + 1, totalVestingMonths);
  const cumulativeExpense = monthlyExpense * cumulativeMonths;
  const expenseAmount = monthlyExpense;
  
  // Count vested shares as of period end
  const periodEnd = new Date(periodDate);
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  const sharesVested = schedule.filter((s) => new Date(s.date) <= periodEnd).reduce((sum, s) => sum + s.shares, 0);
  
  return {
    periodLabel,
    expenseAmount: round2(expenseAmount),
    cumulativeExpense: round2(cumulativeExpense),
    sharesVested,
    remainingExpense: round2(totalGrantValue - cumulativeExpense),
    totalGrantValue,
  };
}

// ============================================================================
// Dilution Impact (Treasury Stock Method)
// ============================================================================

export interface DilutionImpact {
  basicShares: number;
  dilutedShares: number;
  dilutionPercent: number;
  optionsOutstanding: number;
  inTheMoneyOptions: number;
  treasuryStockMethod: {
    sharesFromExercise: number;
    proceedsFromExercise: number;
    sharesRepurchased: number;
    netDilution: number;
  };
}

/**
 * Calculate dilution impact using treasury stock method.
 */
export async function calculateDilutionImpact(
  tenantId: string,
  pool: Pool,
  basicShares: number,
  stockPrice: number
): Promise<DilutionImpact> {
  const grants = await repo.listGrants(pool, tenantId, { status: 'active' });
  
  let totalOptionsOutstanding = 0;
  let inTheMoneyOptions = 0;
  let sharesFromExercise = 0;
  let proceedsFromExercise = 0;
  
  for (const grant of grants) {
    if (grant.grantType === 'option' || grant.grantType === 'sar') {
      const strikePrice = grant.grantPrice ?? 0;
      const unvestedShares = grant.vestingSchedule.filter((s) => !s.vested).reduce((sum, s) => sum + s.shares, 0);
      const optionShares = grant.sharesGranted - unvestedShares;
      
      totalOptionsOutstanding += optionShares;
      
      // In-the-money if stock price > strike price
      if (stockPrice > strikePrice && optionShares > 0) {
        inTheMoneyOptions += optionShares;
        sharesFromExercise += optionShares;
        proceedsFromExercise += optionShares * strikePrice;
      }
    } else if (grant.grantType === 'rsu') {
      // RSUs are dilutive regardless of price
      const unvestedShares = grant.vestingSchedule.filter((s) => !s.vested).reduce((sum, s) => sum + s.shares, 0);
      inTheMoneyOptions += unvestedShares;
      sharesFromExercise += unvestedShares;
    }
  }
  
  // Treasury stock method: company uses proceeds to repurchase shares at market price
  const sharesRepurchased = stockPrice > 0 ? Math.floor(proceedsFromExercise / stockPrice) : 0;
  const netDilution = sharesFromExercise - sharesRepurchased;
  
  const dilutedShares = basicShares + netDilution;
  const dilutionPercent = basicShares > 0 ? (netDilution / basicShares) * 100 : 0;
  
  return {
    basicShares,
    dilutedShares,
    dilutionPercent: round2(dilutionPercent),
    optionsOutstanding: totalOptionsOutstanding,
    inTheMoneyOptions,
    treasuryStockMethod: {
      sharesFromExercise,
      proceedsFromExercise,
      sharesRepurchased,
      netDilution,
    },
  };
}

// ============================================================================
// Grant Management
// ============================================================================

export async function createGrant(
  tenantId: string,
  pool: Pool,
  grant: Omit<StockGrantRow, 'id' | 'createdAt' | 'updatedAt' | 'tenantId'>
): Promise<StockGrantRow> {
  return repo.createGrant(pool, tenantId, grant);
}

export async function getGrant(tenantId: string, pool: Pool, id: string): Promise<StockGrantRow | null> {
  return repo.getGrant(pool, tenantId, id);
}

export async function listGrants(
  tenantId: string,
  pool: Pool,
  filters?: { status?: string; grantType?: string }
): Promise<StockGrantRow[]> {
  return repo.listGrants(pool, tenantId, filters);
}

export async function updateGrant(
  tenantId: string,
  pool: Pool,
  id: string,
  patch: Partial<StockGrantRow>
): Promise<StockGrantRow | null> {
  return repo.updateGrant(pool, tenantId, id, patch);
}

export async function recordValuation(
  tenantId: string,
  pool: Pool,
  valuation: { grantId: string; valuationDate: string; method: string; fairValuePerShare: number; parameters?: any }
) {
  return repo.recordValuation(pool, tenantId, valuation);
}

export async function recordExpense(
  tenantId: string,
  pool: Pool,
  expense: { grantId: string; periodLabel: string; expenseAmount: number; cumulativeExpense: number; sharesVested: number }
) {
  return repo.recordExpense(pool, tenantId, expense);
}

export async function getTotalExpenseForPeriod(tenantId: string, pool: Pool, periodLabel: string): Promise<number> {
  return repo.getTotalExpenseForPeriod(pool, tenantId, periodLabel);
}
