/**
 * Portfolio analytics service — Sharpe, Sortino, attribution, rebalancing.
 * GIPS: gips_disclosure attached to finalized performance responses.
 */

import { createHash } from 'crypto';
import type { Pool } from 'pg';
import * as repo from '../db/repositories/portfolio_repository.js';
import type {
  PortfolioRow,
  PositionRow,
  PerformanceRow,
  PerformanceCorrectionRow,
} from '../db/repositories/portfolio_repository.js';

export type { PortfolioRow, PositionRow, PerformanceRow, PerformanceCorrectionRow };

/** Performance row as returned to client; includes gips_disclosure when status is finalized. */
export type PerformanceResponse = PerformanceRow & { gips_disclosure?: string };

/**
 * Compute a stable SHA-256 hash over the performance record's key fields (GIPS disclosure).
 */
function performanceRecordHash(row: PerformanceRow): string {
  const canonical = {
    tenantId: row.tenantId,
    portfolioId: row.portfolioId,
    periodLabel: row.periodLabel,
    id: row.id,
    totalReturn: row.totalReturn,
    benchmarkReturn: row.benchmarkReturn,
    excessReturn: row.excessReturn,
    sharpeRatio: row.sharpeRatio,
    sortinoRatio: row.sortinoRatio,
    status: row.status,
    finalizedAt: row.finalizedAt,
  };
  return createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex');
}

/**
 * Build GIPS disclosure string for a finalized performance record.
 */
function buildGipsDisclosure(row: PerformanceRow): string {
  const hash = performanceRecordHash(row);
  return `GIPS-aligned period: ${row.periodLabel}. Original performance record id: ${row.id}. Record hash: ${hash}.`;
}

function attachGipsDisclosureIfFinalized(row: PerformanceRow): PerformanceResponse {
  if (row.status === 'finalized') {
    return { ...row, gips_disclosure: buildGipsDisclosure(row) };
  }
  return row;
}

// ============================================================================
// Risk Metrics
// ============================================================================

export function calculateSharpeRatio(returns: number[], riskFreeRate: number): number {
  if (returns.length < 2) return 0;
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1);
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return 0;
  return (avgReturn - riskFreeRate) / stdDev;
}

export function calculateSortinoRatio(returns: number[], riskFreeRate: number): number {
  if (returns.length < 2) return 0;
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const downsideReturns = returns.filter((r) => r < riskFreeRate);
  if (downsideReturns.length === 0) return avgReturn > riskFreeRate ? Infinity : 0;
  const downsideVariance = downsideReturns.reduce((sum, r) => sum + Math.pow(r - riskFreeRate, 2), 0) / downsideReturns.length;
  const downsideDev = Math.sqrt(downsideVariance);
  if (downsideDev === 0) return 0;
  return (avgReturn - riskFreeRate) / downsideDev;
}

export function calculateMaxDrawdown(values: number[]): number {
  if (values.length < 2) return 0;
  let maxDrawdown = 0;
  let peak = values[0];
  for (const value of values) {
    if (value > peak) peak = value;
    const drawdown = (peak - value) / peak;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }
  return maxDrawdown;
}

export function calculateBeta(portfolioReturns: number[], benchmarkReturns: number[]): number {
  if (portfolioReturns.length < 2 || portfolioReturns.length !== benchmarkReturns.length) return 1;
  const avgPortfolio = portfolioReturns.reduce((a, b) => a + b, 0) / portfolioReturns.length;
  const avgBenchmark = benchmarkReturns.reduce((a, b) => a + b, 0) / benchmarkReturns.length;
  let covariance = 0;
  let benchmarkVariance = 0;
  for (let i = 0; i < portfolioReturns.length; i++) {
    covariance += (portfolioReturns[i] - avgPortfolio) * (benchmarkReturns[i] - avgBenchmark);
    benchmarkVariance += Math.pow(benchmarkReturns[i] - avgBenchmark, 2);
  }
  if (benchmarkVariance === 0) return 1;
  return covariance / benchmarkVariance;
}

export function calculateAlpha(portfolioReturn: number, benchmarkReturn: number, beta: number, riskFreeRate: number): number {
  return portfolioReturn - (riskFreeRate + beta * (benchmarkReturn - riskFreeRate));
}

// ============================================================================
// Asset Allocation
// ============================================================================

export interface AllocationAnalysis {
  currentAllocation: Record<string, number>;
  targetAllocation: Record<string, number>;
  drifts: Record<string, number>;
  rebalanceNeeded: boolean;
  rebalanceTrades: Array<{ assetClass: string; action: 'buy' | 'sell'; amount: number }>;
}

export async function analyzeAllocation(tenantId: string, pool: Pool, portfolioId: string): Promise<AllocationAnalysis> {
  const portfolio = await repo.getPortfolio(pool, tenantId, portfolioId);
  const positions = await repo.listPositions(pool, tenantId, portfolioId);
  
  const totalValue = positions.reduce((sum, p) => sum + (p.currentValue ?? 0), 0);
  const currentAllocation: Record<string, number> = {};
  
  for (const pos of positions) {
    const value = pos.currentValue ?? 0;
    const weight = totalValue > 0 ? value / totalValue : 0;
    currentAllocation[pos.assetClass] = (currentAllocation[pos.assetClass] ?? 0) + weight;
  }
  
  const targetAllocation = portfolio?.targetAllocation ?? {};
  const drifts: Record<string, number> = {};
  const allClasses = new Set([...Object.keys(currentAllocation), ...Object.keys(targetAllocation)]);
  
  for (const assetClass of allClasses) {
    const current = currentAllocation[assetClass] ?? 0;
    const target = targetAllocation[assetClass] ?? 0;
    drifts[assetClass] = current - target;
  }
  
  // Check if rebalance needed (>5% drift)
  const rebalanceNeeded = Object.values(drifts).some((d) => Math.abs(d) > 0.05);
  
  // Calculate rebalance trades
  const rebalanceTrades: Array<{ assetClass: string; action: 'buy' | 'sell'; amount: number }> = [];
  for (const [assetClass, drift] of Object.entries(drifts)) {
    if (Math.abs(drift) > 0.02) {
      const amount = Math.abs(drift * totalValue);
      rebalanceTrades.push({
        assetClass,
        action: drift > 0 ? 'sell' : 'buy',
        amount: round2(amount),
      });
    }
  }
  
  return { currentAllocation, targetAllocation, drifts, rebalanceNeeded, rebalanceTrades };
}

// ============================================================================
// Performance Attribution
// ============================================================================

export interface PerformanceAttribution {
  portfolioReturn: number;
  benchmarkReturn: number;
  excessReturn: number;
  allocationEffect: number;
  selectionEffect: number;
  interactionEffect: number;
}

export function calculateAttribution(
  portfolioWeights: Record<string, number>,
  portfolioReturns: Record<string, number>,
  benchmarkWeights: Record<string, number>,
  benchmarkReturns: Record<string, number>
): PerformanceAttribution {
  let portfolioReturn = 0;
  let benchmarkReturn = 0;
  let allocationEffect = 0;
  let selectionEffect = 0;
  let interactionEffect = 0;
  
  const allClasses = new Set([...Object.keys(portfolioWeights), ...Object.keys(benchmarkWeights)]);
  
  for (const assetClass of allClasses) {
    const wp = portfolioWeights[assetClass] ?? 0;
    const wb = benchmarkWeights[assetClass] ?? 0;
    const rp = portfolioReturns[assetClass] ?? 0;
    const rb = benchmarkReturns[assetClass] ?? 0;
    
    portfolioReturn += wp * rp;
    benchmarkReturn += wb * rb;
    
    // Brinson-Fachler attribution
    allocationEffect += (wp - wb) * rb;
    selectionEffect += wb * (rp - rb);
    interactionEffect += (wp - wb) * (rp - rb);
  }
  
  return {
    portfolioReturn: round4(portfolioReturn),
    benchmarkReturn: round4(benchmarkReturn),
    excessReturn: round4(portfolioReturn - benchmarkReturn),
    allocationEffect: round4(allocationEffect),
    selectionEffect: round4(selectionEffect),
    interactionEffect: round4(interactionEffect),
  };
}

// ============================================================================
// CRUD Operations
// ============================================================================

export async function createPortfolio(tenantId: string, pool: Pool, p: Omit<PortfolioRow, 'id' | 'createdAt' | 'tenantId'>): Promise<PortfolioRow> {
  return repo.createPortfolio(pool, tenantId, p);
}

export async function getPortfolio(tenantId: string, pool: Pool, id: string): Promise<PortfolioRow | null> {
  return repo.getPortfolio(pool, tenantId, id);
}

export async function listPortfolios(tenantId: string, pool: Pool): Promise<PortfolioRow[]> {
  return repo.listPortfolios(pool, tenantId);
}

export async function deletePortfolio(tenantId: string, pool: Pool, id: string): Promise<boolean> {
  return repo.deletePortfolio(pool, tenantId, id);
}

export async function addPosition(tenantId: string, pool: Pool, pos: Omit<PositionRow, 'id' | 'createdAt' | 'tenantId'>): Promise<PositionRow> {
  return repo.addPosition(pool, tenantId, pos);
}

export async function listPositions(tenantId: string, pool: Pool, portfolioId: string): Promise<PositionRow[]> {
  return repo.listPositions(pool, tenantId, portfolioId);
}

export async function getPerformanceByPeriod(
  tenantId: string,
  pool: Pool,
  portfolioId: string,
  periodLabel: string
): Promise<PerformanceResponse | null> {
  const row = await repo.getPerformanceByPeriod(pool, tenantId, portfolioId, periodLabel);
  return row ? attachGipsDisclosureIfFinalized(row) : null;
}

export async function finalizePerformance(
  tenantId: string,
  pool: Pool,
  portfolioId: string,
  periodLabel: string,
  finalizedBy?: string
): Promise<PerformanceResponse | null> {
  const row = await repo.finalizePerformance(pool, tenantId, portfolioId, periodLabel, finalizedBy);
  return row ? attachGipsDisclosureIfFinalized(row) : null;
}

export async function recordPerformanceCorrection(
  tenantId: string,
  pool: Pool,
  payload: {
    portfolioId: string;
    periodLabel: string;
    originalPerformanceId: string;
    correctionSnapshot: Record<string, unknown>;
    reason: string;
    createdBy?: string;
  }
): Promise<PerformanceCorrectionRow> {
  return repo.recordPerformanceCorrection(pool, tenantId, payload);
}

export async function recordPerformance(
  tenantId: string,
  pool: Pool,
  perf: Omit<PerformanceRow, 'id' | 'createdAt' | 'tenantId' | 'status' | 'finalizedAt' | 'finalizedBy'>
): Promise<PerformanceRow | PerformanceCorrectionRow> {
  return repo.recordPerformance(pool, tenantId, perf);
}

export async function listPerformance(tenantId: string, pool: Pool, portfolioId: string): Promise<PerformanceResponse[]> {
  const rows = await repo.listPerformance(pool, tenantId, portfolioId);
  return rows.map(attachGipsDisclosureIfFinalized);
}
