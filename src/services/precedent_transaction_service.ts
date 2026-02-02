/**
 * Precedent transaction analysis service.
 */

import type { Pool } from 'pg';
import * as repo from '../db/repositories/precedent_repository.js';
import type { PrecedentAnalysisRow, PrecedentTransactionRow } from '../db/repositories/precedent_repository.js';
import { round2, round4 } from '../utils/decimal.js';

export type { PrecedentAnalysisRow, PrecedentTransactionRow };

export interface PrecedentTransaction {
  targetCompany: string;
  acquirer: string;
  announcementDate: string;
  transactionValue: number;
  targetRevenue: number;
  targetEbitda: number;
  dealStructure?: 'cash' | 'stock' | 'mixed';
  controlPremium?: number;
}

export interface PrecedentAnalysisResult {
  targetCompany: string;
  transactions: Array<PrecedentTransaction & { multiples: { evEbitda: number; evRevenue: number } }>;
  medianMultiples: { evEbitda: number; evRevenue: number };
  medianControlPremium: number;
  valuationRange: { low: number; median: number; high: number };
}

function median(values: number[]): number {
  const filtered = values.filter((v) => v > 0);
  if (filtered.length === 0) return 0;
  const sorted = [...filtered].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

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

export function performPrecedentAnalysis(
  targetCompany: string,
  transactions: PrecedentTransaction[],
  targetEbitda: number
): PrecedentAnalysisResult {
  const txnsWithMultiples = transactions.map((t) => ({
    ...t,
    multiples: {
      evEbitda: t.targetEbitda > 0 ? t.transactionValue / t.targetEbitda : 0,
      evRevenue: t.targetRevenue > 0 ? t.transactionValue / t.targetRevenue : 0,
    },
  }));

  const evEbitdaValues = txnsWithMultiples.map((t) => t.multiples.evEbitda);
  const premiums = transactions.map((t) => t.controlPremium ?? 0).filter((p) => p > 0);

  const medianMultiples = {
    evEbitda: round2(median(evEbitdaValues)),
    evRevenue: round2(median(txnsWithMultiples.map((t) => t.multiples.evRevenue))),
  };

  const valuationRange = {
    low: round2(percentile(evEbitdaValues, 25) * targetEbitda),
    median: round2(median(evEbitdaValues) * targetEbitda),
    high: round2(percentile(evEbitdaValues, 75) * targetEbitda),
  };

  return {
    targetCompany,
    transactions: txnsWithMultiples,
    medianMultiples,
    medianControlPremium: round4(median(premiums)),
    valuationRange,
  };
}

export async function createAnalysis(
  tenantId: string,
  pool: Pool,
  targetCompany: string,
  transactions: PrecedentTransaction[],
  targetEbitda: number
): Promise<{ analysis: PrecedentAnalysisRow; result: PrecedentAnalysisResult }> {
  const result = performPrecedentAnalysis(targetCompany, transactions, targetEbitda);
  const analysis = await repo.createAnalysis(pool, tenantId, {
    targetCompany,
    analysisDate: new Date().toISOString().slice(0, 10),
    targetMetrics: { ebitda: targetEbitda },
    valuationRange: result.valuationRange,
  });

  for (const txn of result.transactions) {
    await repo.addTransaction(pool, tenantId, {
      analysisId: analysis.id,
      targetCompany: txn.targetCompany,
      acquirer: txn.acquirer,
      announcementDate: txn.announcementDate,
      transactionValue: txn.transactionValue,
      targetRevenue: txn.targetRevenue,
      targetEbitda: txn.targetEbitda,
      multiples: txn.multiples,
      dealStructure: txn.dealStructure,
      controlPremium: txn.controlPremium,
      isExcluded: false,
    });
  }

  return { analysis, result };
}

export async function getAnalysis(tenantId: string, pool: Pool, id: string): Promise<PrecedentAnalysisRow | null> {
  return repo.getAnalysis(pool, tenantId, id);
}

export async function listAnalyses(tenantId: string, pool: Pool): Promise<PrecedentAnalysisRow[]> {
  return repo.listAnalyses(pool, tenantId);
}

export async function listTransactions(tenantId: string, pool: Pool, analysisId: string): Promise<PrecedentTransactionRow[]> {
  return repo.listTransactions(pool, tenantId, analysisId);
}

export async function deleteAnalysis(tenantId: string, pool: Pool, id: string): Promise<boolean> {
  return repo.deleteAnalysis(pool, tenantId, id);
}
