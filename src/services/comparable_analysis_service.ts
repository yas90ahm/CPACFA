/**
 * Comparable company analysis service — multiples calculation, valuation range.
 */

import type { Pool } from 'pg';
import * as repo from '../db/repositories/comparable_repository.js';
import type { ComparableAnalysisRow, ComparableCompanyRow } from '../db/repositories/comparable_repository.js';
import { round2 } from '../utils/decimal.js';

// Re-export types
export type { ComparableAnalysisRow, ComparableCompanyRow };

// ============================================================================
// Types
// ============================================================================

export interface ComparableCompany {
  companyName: string;
  ticker?: string;
  marketCap: number;
  enterpriseValue: number;
  revenue: number;
  ebitda: number;
  netIncome: number;
  bookValue: number;
}

export interface ComparableMultiples {
  evEbitda: number;
  evRevenue: number;
  pe: number;
  pb: number;
}

export interface ComparableWithMultiples extends ComparableCompany {
  multiples: ComparableMultiples;
  isOutlier?: boolean;
}

export interface TargetMetrics {
  revenue: number;
  ebitda: number;
  netIncome: number;
  bookValue: number;
  shares: number;
}

export interface ComparableAnalysisResult {
  targetCompany: string;
  comparables: ComparableWithMultiples[];
  medianMultiples: ComparableMultiples;
  meanMultiples: ComparableMultiples;
  valuationRange: {
    evEbitda: { low: number; median: number; high: number };
    evRevenue: { low: number; median: number; high: number };
    pe: { low: number; median: number; high: number };
    pb: { low: number; median: number; high: number };
  };
  impliedEnterpriseValue: { low: number; median: number; high: number };
  impliedEquityValue: { low: number; median: number; high: number };
  impliedSharePrice: { low: number; median: number; high: number };
}

// ============================================================================
// Multiple Calculation
// ============================================================================

/**
 * Calculate trading multiples for a company.
 */
export function calculateMultiples(company: ComparableCompany): ComparableMultiples {
  return {
    evEbitda: company.ebitda > 0 ? company.enterpriseValue / company.ebitda : 0,
    evRevenue: company.revenue > 0 ? company.enterpriseValue / company.revenue : 0,
    pe: company.netIncome > 0 ? company.marketCap / company.netIncome : 0,
    pb: company.bookValue > 0 ? company.marketCap / company.bookValue : 0,
  };
}

/**
 * Calculate median of an array.
 */
function median(values: number[]): number {
  const filtered = values.filter((v) => v > 0);
  if (filtered.length === 0) return 0;
  const sorted = [...filtered].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Calculate mean of an array.
 */
function mean(values: number[]): number {
  const filtered = values.filter((v) => v > 0);
  if (filtered.length === 0) return 0;
  return filtered.reduce((a, b) => a + b, 0) / filtered.length;
}

/**
 * Calculate percentile of an array.
 */
function percentile(values: number[], p: number): number {
  const filtered = values.filter((v) => v > 0);
  if (filtered.length === 0) return 0;
  const sorted = [...filtered].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

// ============================================================================
// Comparable Analysis
// ============================================================================

/**
 * Perform comparable company analysis.
 */
export function performComparableAnalysis(
  targetCompany: string,
  comparables: ComparableCompany[],
  targetMetrics: TargetMetrics,
  netDebt: number = 0
): ComparableAnalysisResult {
  // Calculate multiples for each comparable
  const compWithMultiples: ComparableWithMultiples[] = comparables.map((c) => ({
    ...c,
    multiples: calculateMultiples(c),
  }));
  
  // Filter out outliers (optional)
  const validComps = compWithMultiples.filter((c) => !c.isOutlier);
  
  // Calculate median and mean multiples
  const evEbitdaValues = validComps.map((c) => c.multiples.evEbitda);
  const evRevenueValues = validComps.map((c) => c.multiples.evRevenue);
  const peValues = validComps.map((c) => c.multiples.pe);
  const pbValues = validComps.map((c) => c.multiples.pb);
  
  const medianMultiples: ComparableMultiples = {
    evEbitda: round2(median(evEbitdaValues)),
    evRevenue: round2(median(evRevenueValues)),
    pe: round2(median(peValues)),
    pb: round2(median(pbValues)),
  };
  
  const meanMultiples: ComparableMultiples = {
    evEbitda: round2(mean(evEbitdaValues)),
    evRevenue: round2(mean(evRevenueValues)),
    pe: round2(mean(peValues)),
    pb: round2(mean(pbValues)),
  };
  
  // Valuation range (25th, 50th, 75th percentile)
  const valuationRange = {
    evEbitda: {
      low: round2(percentile(evEbitdaValues, 25) * targetMetrics.ebitda),
      median: round2(median(evEbitdaValues) * targetMetrics.ebitda),
      high: round2(percentile(evEbitdaValues, 75) * targetMetrics.ebitda),
    },
    evRevenue: {
      low: round2(percentile(evRevenueValues, 25) * targetMetrics.revenue),
      median: round2(median(evRevenueValues) * targetMetrics.revenue),
      high: round2(percentile(evRevenueValues, 75) * targetMetrics.revenue),
    },
    pe: {
      low: round2(percentile(peValues, 25) * targetMetrics.netIncome),
      median: round2(median(peValues) * targetMetrics.netIncome),
      high: round2(percentile(peValues, 75) * targetMetrics.netIncome),
    },
    pb: {
      low: round2(percentile(pbValues, 25) * targetMetrics.bookValue),
      median: round2(median(pbValues) * targetMetrics.bookValue),
      high: round2(percentile(pbValues, 75) * targetMetrics.bookValue),
    },
  };
  
  // Use EV/EBITDA as primary for implied values
  const impliedEnterpriseValue = valuationRange.evEbitda;
  const impliedEquityValue = {
    low: round2(impliedEnterpriseValue.low - netDebt),
    median: round2(impliedEnterpriseValue.median - netDebt),
    high: round2(impliedEnterpriseValue.high - netDebt),
  };
  const impliedSharePrice = {
    low: targetMetrics.shares > 0 ? round2(impliedEquityValue.low / targetMetrics.shares) : 0,
    median: targetMetrics.shares > 0 ? round2(impliedEquityValue.median / targetMetrics.shares) : 0,
    high: targetMetrics.shares > 0 ? round2(impliedEquityValue.high / targetMetrics.shares) : 0,
  };
  
  return {
    targetCompany,
    comparables: compWithMultiples,
    medianMultiples,
    meanMultiples,
    valuationRange,
    impliedEnterpriseValue,
    impliedEquityValue,
    impliedSharePrice,
  };
}

// ============================================================================
// CRUD Operations
// ============================================================================

export async function createAnalysis(
  tenantId: string,
  pool: Pool,
  targetCompany: string,
  targetMetrics: TargetMetrics,
  comparables: ComparableCompany[],
  netDebt: number = 0
): Promise<{ analysis: ComparableAnalysisRow; result: ComparableAnalysisResult }> {
  const result = performComparableAnalysis(targetCompany, comparables, targetMetrics, netDebt);
  
  const analysis = await repo.createAnalysis(pool, tenantId, {
    targetCompany,
    analysisDate: new Date().toISOString().slice(0, 10),
    targetMetrics,
    valuationMetrics: result.medianMultiples,
    valuationRange: result.impliedSharePrice,
  });
  
  // Add comparable companies
  for (const comp of result.comparables) {
    await repo.addComparableCompany(pool, tenantId, {
      analysisId: analysis.id,
      companyName: comp.companyName,
      ticker: comp.ticker,
      marketCap: comp.marketCap,
      enterpriseValue: comp.enterpriseValue,
      revenue: comp.revenue,
      ebitda: comp.ebitda,
      netIncome: comp.netIncome,
      bookValue: comp.bookValue,
      multiples: comp.multiples,
      isOutlier: comp.isOutlier ?? false,
    });
  }
  
  return { analysis, result };
}

export async function getAnalysis(tenantId: string, pool: Pool, id: string): Promise<ComparableAnalysisRow | null> {
  return repo.getAnalysis(pool, tenantId, id);
}

export async function listAnalyses(tenantId: string, pool: Pool): Promise<ComparableAnalysisRow[]> {
  return repo.listAnalyses(pool, tenantId);
}

export async function deleteAnalysis(tenantId: string, pool: Pool, id: string): Promise<boolean> {
  return repo.deleteAnalysis(pool, tenantId, id);
}

export async function listComparableCompanies(tenantId: string, pool: Pool, analysisId: string): Promise<ComparableCompanyRow[]> {
  return repo.listComparableCompanies(pool, tenantId, analysisId);
}

export async function markAsOutlier(
  tenantId: string,
  pool: Pool,
  companyId: string,
  isOutlier: boolean,
  reason?: string
): Promise<boolean> {
  return repo.updateComparableCompany(pool, tenantId, companyId, { isOutlier, outlierReason: reason });
}
