/**
 * EPS service — basic and diluted EPS (ASC 260): treasury stock method, if-converted.
 */

import type { Pool } from 'pg';
import * as repo from '../db/repositories/eps_repository.js';
import { round2, round4 } from '../utils/decimal.js';

export interface BasicEpsInput {
  netIncome: number;
  preferredDividends: number;
  weightedAvgShares: number;
}

export interface OptionsWarrant {
  /** Shares exercisable (e.g. options) */
  shares: number;
  /** Exercise price per share */
  exercisePrice: number;
  /** Average market price per share for period */
  avgMarketPrice: number;
}

export interface ConvertibleInstrument {
  /** Additional shares if converted */
  incrementalShares: number;
  /** Interest/dividend add-back to income (net of tax) if converted */
  addBackToIncome: number;
}

export interface EpsResult {
  basicEps: number;
  basicIncomeAvailable: number;
  basicWeightedShares: number;
  dilutedEps: number;
  dilutedIncomeAvailable: number;
  dilutedWeightedShares: number;
  antidilutive: boolean;
  treasuryStockAdjustments?: OptionsWarrant[];
  convertibleAdjustments?: ConvertibleInstrument[];
  optionsWarrants?: OptionsWarrant[];
}

/**
 * Basic EPS = (Net income - Preferred dividends) / Weighted average common shares.
 */
export function calculateBasicEPS(input: BasicEpsInput): {
  basicEps: number;
  basicIncomeAvailable: number;
  basicWeightedShares: number;
} {
  const incomeAvailable = input.netIncome - input.preferredDividends;
  const shares = Math.max(0, input.weightedAvgShares);
  const basicEps = shares > 0 ? incomeAvailable / shares : 0;
  return {
    basicEps: round4(basicEps),
    basicIncomeAvailable: round2(incomeAvailable),
    basicWeightedShares: shares,
  };
}

/**
 * Treasury stock method: assume proceeds used to buy shares at avg market price.
 * Incremental shares = max(0, shares from exercise - assumed repurchased).
 */
function treasuryStockIncrementalShares(
  shares: number,
  exercisePrice: number,
  avgMarketPrice: number
): number {
  if (avgMarketPrice <= 0) return 0;
  const proceeds = shares * exercisePrice;
  const assumedRepurchased = proceeds / avgMarketPrice;
  return Math.max(0, shares - assumedRepurchased);
}

/**
 * Diluted EPS: apply treasury stock method for options/warrants, if-converted for convertibles.
 * Antidilution: if diluted EPS > basic EPS, do not include the dilutive instrument.
 */
export function calculateDilutedEPS(
  basicInput: BasicEpsInput,
  optionsWarrants: OptionsWarrant[] = [],
  convertibles: ConvertibleInstrument[] = []
): EpsResult {
  const basic = calculateBasicEPS(basicInput);
  let dilutedIncome = basic.basicIncomeAvailable;
  let dilutedShares = basic.basicWeightedShares;

  const treasuryAdjustments: { shares: number; exercisePrice: number; avgMarketPrice: number; incrementalShares: number }[] = [];
  for (const ow of optionsWarrants) {
    const inc = treasuryStockIncrementalShares(
      ow.shares,
      ow.exercisePrice,
      ow.avgMarketPrice
    );
    treasuryAdjustments.push({
      shares: ow.shares,
      exercisePrice: ow.exercisePrice,
      avgMarketPrice: ow.avgMarketPrice,
      incrementalShares: inc,
    });
    dilutedShares += inc;
  }

  const convertibleAdjustments: ConvertibleInstrument[] = [];
  for (const c of convertibles) {
    dilutedIncome += c.addBackToIncome;
    dilutedShares += c.incrementalShares;
    convertibleAdjustments.push(c);
  }

  const dilutedEps =
    dilutedShares > 0 ? dilutedIncome / dilutedShares : basic.basicEps;
  const antidilutive = dilutedEps > basic.basicEps;

  const finalDilutedEps = antidilutive ? basic.basicEps : dilutedEps;
  const finalDilutedIncome = antidilutive ? basic.basicIncomeAvailable : dilutedIncome;
  const finalDilutedShares = antidilutive ? basic.basicWeightedShares : dilutedShares;

  return {
    basicEps: basic.basicEps,
    basicIncomeAvailable: basic.basicIncomeAvailable,
    basicWeightedShares: basic.basicWeightedShares,
    dilutedEps: round4(finalDilutedEps),
    dilutedIncomeAvailable: round2(finalDilutedIncome),
    dilutedWeightedShares: round4(finalDilutedShares),
    antidilutive,
    optionsWarrants: optionsWarrants.length > 0 ? optionsWarrants : undefined,
    convertibleAdjustments:
      convertibles.length > 0 ? convertibleAdjustments : undefined,
    treasuryStockAdjustments:
      treasuryAdjustments.length > 0
        ? treasuryAdjustments.map((t) => ({
            shares: t.shares,
            exercisePrice: t.exercisePrice,
            avgMarketPrice: t.avgMarketPrice,
          }))
        : undefined,
  };
}

export async function saveEpsCalculation(
  tenantId: string,
  pool: Pool,
  periodLabel: string,
  result: EpsResult
): Promise<repo.EpsCalculationRow> {
  return repo.createEpsCalculation(pool, tenantId, {
    periodLabel,
    basicIncomeAvailable: result.basicIncomeAvailable,
    basicWeightedShares: result.basicWeightedShares,
    basicEps: result.basicEps,
    dilutedIncomeAvailable: result.dilutedIncomeAvailable,
    dilutedWeightedShares: result.dilutedWeightedShares,
    dilutedEps: result.dilutedEps,
    treasuryStockAdjustments: result.treasuryStockAdjustments,
    convertibleAdjustments: result.convertibleAdjustments,
    optionsWarrants: result.optionsWarrants,
  });
}

export async function getEpsForPeriod(
  tenantId: string,
  pool: Pool,
  periodLabel: string
): Promise<repo.EpsCalculationRow | null> {
  return repo.getEpsByPeriod(pool, tenantId, periodLabel);
}

export async function getEpsById(
  tenantId: string,
  pool: Pool,
  id: string
): Promise<repo.EpsCalculationRow | null> {
  return repo.getEpsCalculation(pool, tenantId, id);
}

export async function listEpsCalculations(
  tenantId: string,
  pool: Pool
): Promise<repo.EpsCalculationRow[]> {
  return repo.listEpsCalculations(pool, tenantId);
}
