/**
 * Segment reporting service — 10% test, reconciliation, segment report (IFRS 8 / ASC 280).
 */

import type { Pool } from 'pg';
import { round2 } from '../utils/decimal.js';
import * as repo from '../db/repositories/segment_repository.js';
import type { OperatingSegmentRow, SegmentFinancialsRow, SegmentReconciliationRow, ReconcilingItem } from '../db/repositories/segment_repository.js';

// Re-export types
export type { OperatingSegmentRow, SegmentFinancialsRow, SegmentReconciliationRow, ReconcilingItem };

// ============================================================================
// Segment Financials Type
// ============================================================================

export interface SegmentFinancials {
  segmentId: string;
  segmentName: string;
  revenue: number;
  intersegmentRevenue: number;
  externalRevenue: number;
  profitLoss: number;
  assets: number;
  liabilities: number;
}

// ============================================================================
// 10% Quantitative Test
// ============================================================================

export interface TenPercentTestResult {
  revenueTest: { threshold: number; qualifying: string[] };
  profitTest: { threshold: number; qualifying: string[] };
  assetTest: { threshold: number; qualifying: string[] };
  reportableSegments: string[];
  coverageCheck: { totalRevenue: number; reportableRevenue: number; coveragePercent: number; meetsThreshold: boolean };
}

/**
 * Apply 10% quantitative threshold test for segment reportability.
 */
export function applyTenPercentTest(
  segments: SegmentFinancials[],
  consolidatedRevenue: number,
  consolidatedProfit: number,
  consolidatedAssets: number
): TenPercentTestResult {
  const revenueThreshold = consolidatedRevenue * 0.1;
  const profitThreshold = Math.abs(consolidatedProfit) * 0.1;
  const assetThreshold = consolidatedAssets * 0.1;
  
  const revenueQualifying: string[] = [];
  const profitQualifying: string[] = [];
  const assetQualifying: string[] = [];
  
  for (const seg of segments) {
    if (seg.revenue >= revenueThreshold) revenueQualifying.push(seg.segmentId);
    if (Math.abs(seg.profitLoss) >= profitThreshold) profitQualifying.push(seg.segmentId);
    if (seg.assets >= assetThreshold) assetQualifying.push(seg.segmentId);
  }
  
  // Reportable = qualifies under any test
  const reportableSet = new Set([...revenueQualifying, ...profitQualifying, ...assetQualifying]);
  const reportableSegments = Array.from(reportableSet);
  
  // 75% coverage check
  const reportableRevenue = segments
    .filter((s) => reportableSet.has(s.segmentId))
    .reduce((sum, s) => sum + s.externalRevenue, 0);
  const coveragePercent = consolidatedRevenue > 0 ? (reportableRevenue / consolidatedRevenue) * 100 : 0;
  
  return {
    revenueTest: { threshold: revenueThreshold, qualifying: revenueQualifying },
    profitTest: { threshold: profitThreshold, qualifying: profitQualifying },
    assetTest: { threshold: assetThreshold, qualifying: assetQualifying },
    reportableSegments,
    coverageCheck: {
      totalRevenue: consolidatedRevenue,
      reportableRevenue,
      coveragePercent: round2(coveragePercent),
      meetsThreshold: coveragePercent >= 75,
    },
  };
}

// ============================================================================
// Segment Report
// ============================================================================

export interface SegmentReportingResult {
  periodLabel: string;
  segments: SegmentFinancials[];
  reconciliation: {
    revenue: { segmentTotal: number; consolidated: number; items: ReconcilingItem[] };
    profit: { segmentTotal: number; consolidated: number; items: ReconcilingItem[] };
    assets: { segmentTotal: number; consolidated: number; items: ReconcilingItem[] };
  };
  tenPercentTest: TenPercentTestResult;
  reportableSegments: string[];
}

/**
 * Build complete segment report with 10% test and reconciliation.
 */
export async function buildSegmentReport(
  tenantId: string,
  pool: Pool,
  periodLabel: string,
  consolidatedTotals: { revenue: number; profit: number; assets: number }
): Promise<SegmentReportingResult> {
  const segments = await repo.listSegments(pool, tenantId);
  const financials = await repo.listSegmentFinancials(pool, tenantId, periodLabel);
  const reconciliations = await repo.listReconciliations(pool, tenantId, periodLabel);
  
  // Build segment financials
  const segmentFinancials: SegmentFinancials[] = [];
  let segmentRevenue = 0, segmentProfit = 0, segmentAssets = 0;
  
  for (const seg of segments) {
    const fin = financials.find((f) => f.segmentId === seg.id);
    const revenue = fin?.revenue ?? 0;
    const interseg = fin?.intersegmentRevenue ?? 0;
    const external = fin?.externalRevenue ?? (revenue - interseg);
    const profit = fin?.profitLoss ?? 0;
    const assets = fin?.assets ?? 0;
    const liabilities = fin?.liabilities ?? 0;
    
    segmentRevenue += revenue;
    segmentProfit += profit;
    segmentAssets += assets;
    
    segmentFinancials.push({
      segmentId: seg.id,
      segmentName: seg.segmentName,
      revenue,
      intersegmentRevenue: interseg,
      externalRevenue: external,
      profitLoss: profit,
      assets,
      liabilities,
    });
  }
  
  // Apply 10% test
  const tenPercentTest = applyTenPercentTest(
    segmentFinancials,
    consolidatedTotals.revenue,
    consolidatedTotals.profit,
    consolidatedTotals.assets
  );
  
  // Build reconciliation
  const revenueRecon = reconciliations.find((r) => r.itemType === 'revenue');
  const profitRecon = reconciliations.find((r) => r.itemType === 'profit');
  const assetRecon = reconciliations.find((r) => r.itemType === 'assets');
  
  return {
    periodLabel,
    segments: segmentFinancials,
    reconciliation: {
      revenue: {
        segmentTotal: segmentRevenue,
        consolidated: consolidatedTotals.revenue,
        items: revenueRecon?.reconcilingItems ?? [],
      },
      profit: {
        segmentTotal: segmentProfit,
        consolidated: consolidatedTotals.profit,
        items: profitRecon?.reconcilingItems ?? [],
      },
      assets: {
        segmentTotal: segmentAssets,
        consolidated: consolidatedTotals.assets,
        items: assetRecon?.reconcilingItems ?? [],
      },
    },
    tenPercentTest,
    reportableSegments: tenPercentTest.reportableSegments,
  };
}

// ============================================================================
// CRUD Operations
// ============================================================================

export async function createSegment(
  tenantId: string,
  pool: Pool,
  segment: Omit<OperatingSegmentRow, 'id' | 'createdAt' | 'tenantId'>
): Promise<OperatingSegmentRow> {
  return repo.createSegment(pool, tenantId, segment);
}

export async function getSegment(tenantId: string, pool: Pool, id: string): Promise<OperatingSegmentRow | null> {
  return repo.getSegment(pool, tenantId, id);
}

export async function listSegments(tenantId: string, pool: Pool): Promise<OperatingSegmentRow[]> {
  return repo.listSegments(pool, tenantId);
}

export async function updateSegment(
  tenantId: string,
  pool: Pool,
  id: string,
  patch: Partial<OperatingSegmentRow>
): Promise<OperatingSegmentRow | null> {
  return repo.updateSegment(pool, tenantId, id, patch);
}

export async function deleteSegment(tenantId: string, pool: Pool, id: string): Promise<boolean> {
  return repo.deleteSegment(pool, tenantId, id);
}

export async function createSegmentFinancials(
  tenantId: string,
  pool: Pool,
  financials: Omit<SegmentFinancialsRow, 'id' | 'createdAt' | 'tenantId'>
): Promise<SegmentFinancialsRow> {
  return repo.createSegmentFinancials(pool, tenantId, financials);
}

export async function listSegmentFinancials(tenantId: string, pool: Pool, periodLabel?: string, segmentId?: string): Promise<SegmentFinancialsRow[]> {
  return repo.listSegmentFinancials(pool, tenantId, periodLabel, segmentId);
}

export async function createReconciliation(
  tenantId: string,
  pool: Pool,
  reconciliation: Omit<SegmentReconciliationRow, 'id' | 'createdAt' | 'tenantId'>
): Promise<SegmentReconciliationRow> {
  return repo.createReconciliation(pool, tenantId, reconciliation);
}

export async function listReconciliations(tenantId: string, pool: Pool, periodLabel?: string): Promise<SegmentReconciliationRow[]> {
  return repo.listReconciliations(pool, tenantId, periodLabel);
}
