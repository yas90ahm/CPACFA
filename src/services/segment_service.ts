/**
 * Segment reporting service — operating segments, financials, reportability (IFRS 8 / ASC 280).
 */

import type { Pool } from 'pg';
import * as repo from '../db/repositories/segment_repository.js';
import type { OperatingSegmentRow, SegmentFinancialsRow, SegmentReconciliationRow } from '../db/repositories/segment_repository.js';
import { round2 } from '../utils/decimal.js';

export type { OperatingSegmentRow, SegmentFinancialsRow, SegmentReconciliationRow };

// Re-export repo CRUD
export const createSegment = repo.createSegment;
export const getSegment = repo.getSegment;
export const listSegments = repo.listSegments;
export const updateSegment = repo.updateSegment;
export const deleteSegment = repo.deleteSegment;
export const createSegmentFinancials = repo.createSegmentFinancials;
export const listSegmentFinancials = repo.listSegmentFinancials;
export const createReconciliation = repo.createReconciliation;
export const listReconciliations = repo.listReconciliations;

export interface ReportabilityResult {
  segments: {
    segmentId: string;
    segmentName: string;
    revenuePercent: number;
    profitLossPercent: number;
    assetsPercent: number;
    isReportable: boolean;
    thresholdsMet: string[];
  }[];
  aggregateRevenuePercent: number;
  aggregateTestPassed: boolean;
}

/**
 * ASC 280 reportability thresholds:
 * 1. Revenue test: segment revenue >= 10% of total revenue
 * 2. Profit/loss test: segment |profit/loss| >= 10% of max(|total profit|, |total loss|)
 * 3. Assets test: segment assets >= 10% of total assets
 * 4. Aggregate test: reportable segments must cover >= 75% of total external revenue
 */
export async function checkReportabilityThresholds(
  pool: Pool,
  tenantId: string,
  periodLabel: string
): Promise<ReportabilityResult> {
  const segments = await repo.listSegments(pool, tenantId);
  const financials = await repo.listSegmentFinancials(pool, tenantId, periodLabel);

  // Build segment-to-financials map
  const finMap = new Map<string, SegmentFinancialsRow>();
  for (const f of financials) {
    finMap.set(f.segmentId, f);
  }

  // Compute totals
  let totalRevenue = 0;
  let totalProfit = 0;
  let totalLoss = 0;
  let totalAssets = 0;

  for (const f of financials) {
    totalRevenue += Number(f.revenue ?? 0);
    const pl = Number(f.profitLoss ?? 0);
    if (pl >= 0) totalProfit += pl;
    else totalLoss += Math.abs(pl);
    totalAssets += Number(f.assets ?? 0);
  }

  const profitLossBenchmark = Math.max(totalProfit, totalLoss);
  const results: ReportabilityResult['segments'] = [];
  let reportableRevenue = 0;

  for (const seg of segments) {
    const fin = finMap.get(seg.id);
    const segRevenue = Number(fin?.revenue ?? 0);
    const segPL = Number(fin?.profitLoss ?? 0);
    const segAssets = Number(fin?.assets ?? 0);

    const revenuePercent = totalRevenue > 0 ? round2((segRevenue / totalRevenue) * 100) : 0;
    const profitLossPercent = profitLossBenchmark > 0 ? round2((Math.abs(segPL) / profitLossBenchmark) * 100) : 0;
    const assetsPercent = totalAssets > 0 ? round2((segAssets / totalAssets) * 100) : 0;

    const thresholdsMet: string[] = [];
    if (revenuePercent >= 10) thresholdsMet.push('revenue');
    if (profitLossPercent >= 10) thresholdsMet.push('profit_loss');
    if (assetsPercent >= 10) thresholdsMet.push('assets');

    const isReportable = thresholdsMet.length > 0;
    if (isReportable) reportableRevenue += Number(segRevenue);

    results.push({
      segmentId: seg.id,
      segmentName: seg.segmentName,
      revenuePercent,
      profitLossPercent,
      assetsPercent,
      isReportable,
      thresholdsMet,
    });
  }

  const aggregateRevenuePercent = totalRevenue > 0 ? round2((reportableRevenue / totalRevenue) * 100) : 0;

  return {
    segments: results,
    aggregateRevenuePercent,
    aggregateTestPassed: aggregateRevenuePercent >= 75,
  };
}
