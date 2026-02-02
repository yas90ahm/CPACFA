/**
 * Portfolio analytics repository.
 */

import type { Pool } from 'pg';
import { createHash } from 'crypto';

export interface PortfolioRow {
  id: string;
  tenantId: string;
  portfolioName: string;
  benchmark?: string;
  targetAllocation?: Record<string, number>;
  inceptionDate?: string;
  notes?: string;
  createdAt: string;
}

export interface PositionRow {
  id: string;
  tenantId: string;
  portfolioId: string;
  assetName: string;
  assetClass: 'equities' | 'fixed_income' | 'alternatives' | 'cash';
  ticker?: string;
  quantity?: number;
  costBasis?: number;
  currentValue?: number;
  weight?: number;
  asOfDate?: string;
  createdAt: string;
}

export type PerformanceStatus = 'draft' | 'finalized';

export interface PerformanceRow {
  id: string;
  tenantId: string;
  portfolioId: string;
  periodLabel: string;
  totalReturn?: number;
  benchmarkReturn?: number;
  excessReturn?: number;
  sharpeRatio?: number;
  sortinoRatio?: number;
  beta?: number;
  alpha?: number;
  volatility?: number;
  maxDrawdown?: number;
  status: PerformanceStatus;
  finalizedAt?: string;
  finalizedBy?: string;
  createdAt: string;
}

export interface PerformanceCorrectionRow {
  id: string;
  tenantId: string;
  portfolioId: string;
  periodLabel: string;
  originalPerformanceId: string;
  correctionSnapshot: Record<string, unknown>;
  reason: string;
  previousEntryHash: string | null;
  entryHash: string;
  createdAt: string;
  createdBy?: string;
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function createPortfolio(pool: Pool, tenantId: string, p: Omit<PortfolioRow, 'id' | 'createdAt' | 'tenantId'>): Promise<PortfolioRow> {
  const id = nextId('pf');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO portfolios (id, tenant_id, portfolio_name, benchmark, target_allocation, inception_date, notes, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, tenantId, p.portfolioName, p.benchmark ?? null, p.targetAllocation ? JSON.stringify(p.targetAllocation) : null, p.inceptionDate ?? null, p.notes ?? null, now]
  );
  return { id, tenantId, ...p, createdAt: now };
}

export async function getPortfolio(pool: Pool, tenantId: string, id: string): Promise<PortfolioRow | null> {
  const r = await pool.query('SELECT * FROM portfolios WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  if (!r.rows[0]) return null;
  const row = r.rows[0];
  return { id: row.id, tenantId: row.tenant_id, portfolioName: row.portfolio_name, benchmark: row.benchmark, targetAllocation: row.target_allocation, inceptionDate: row.inception_date, notes: row.notes, createdAt: row.created_at };
}

export async function listPortfolios(pool: Pool, tenantId: string): Promise<PortfolioRow[]> {
  const r = await pool.query('SELECT * FROM portfolios WHERE tenant_id = $1 ORDER BY portfolio_name', [tenantId]);
  return r.rows.map((row) => ({ id: row.id, tenantId: row.tenant_id, portfolioName: row.portfolio_name, benchmark: row.benchmark, targetAllocation: row.target_allocation, inceptionDate: row.inception_date, notes: row.notes, createdAt: row.created_at }));
}

export async function deletePortfolio(pool: Pool, tenantId: string, id: string): Promise<boolean> {
  const r = await pool.query('DELETE FROM portfolios WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  return (r.rowCount ?? 0) > 0;
}

export async function addPosition(pool: Pool, tenantId: string, pos: Omit<PositionRow, 'id' | 'createdAt' | 'tenantId'>): Promise<PositionRow> {
  const id = nextId('pos');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO portfolio_positions (id, tenant_id, portfolio_id, asset_name, asset_class, ticker, quantity, cost_basis, current_value, weight, as_of_date, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [id, tenantId, pos.portfolioId, pos.assetName, pos.assetClass, pos.ticker ?? null, pos.quantity ?? null, pos.costBasis ?? null, pos.currentValue ?? null, pos.weight ?? null, pos.asOfDate ?? null, now]
  );
  return { id, tenantId, ...pos, createdAt: now };
}

export async function listPositions(pool: Pool, tenantId: string, portfolioId: string): Promise<PositionRow[]> {
  const r = await pool.query('SELECT * FROM portfolio_positions WHERE tenant_id = $1 AND portfolio_id = $2 ORDER BY asset_class, asset_name', [tenantId, portfolioId]);
  return r.rows.map((row) => ({ id: row.id, tenantId: row.tenant_id, portfolioId: row.portfolio_id, assetName: row.asset_name, assetClass: row.asset_class, ticker: row.ticker, quantity: row.quantity != null ? Number(row.quantity) : undefined, costBasis: row.cost_basis != null ? Number(row.cost_basis) : undefined, currentValue: row.current_value != null ? Number(row.current_value) : undefined, weight: row.weight != null ? Number(row.weight) : undefined, asOfDate: row.as_of_date, createdAt: row.created_at }));
}

function rowToPerformance(row: Record<string, unknown>): PerformanceRow {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    portfolioId: row.portfolio_id as string,
    periodLabel: row.period_label as string,
    status: (row.status as PerformanceRow['status']) ?? 'draft',
    finalizedAt: row.finalized_at != null ? (row.finalized_at as Date)?.toISOString?.() ?? String(row.finalized_at) : undefined,
    finalizedBy: row.finalized_by as string | undefined,
    totalReturn: row.total_return != null ? Number(row.total_return) : undefined,
    benchmarkReturn: row.benchmark_return != null ? Number(row.benchmark_return) : undefined,
    excessReturn: row.excess_return != null ? Number(row.excess_return) : undefined,
    sharpeRatio: row.sharpe_ratio != null ? Number(row.sharpe_ratio) : undefined,
    sortinoRatio: row.sortino_ratio != null ? Number(row.sortino_ratio) : undefined,
    beta: row.beta != null ? Number(row.beta) : undefined,
    alpha: row.alpha != null ? Number(row.alpha) : undefined,
    volatility: row.volatility != null ? Number(row.volatility) : undefined,
    maxDrawdown: row.max_drawdown != null ? Number(row.max_drawdown) : undefined,
    createdAt: (row.created_at as Date)?.toISOString?.() ?? String(row.created_at),
  };
}

export async function getPerformanceByPeriod(
  pool: Pool,
  tenantId: string,
  portfolioId: string,
  periodLabel: string
): Promise<PerformanceRow | null> {
  const r = await pool.query(
    'SELECT * FROM portfolio_performance WHERE tenant_id = $1 AND portfolio_id = $2 AND period_label = $3',
    [tenantId, portfolioId, periodLabel]
  );
  return r.rows[0] ? rowToPerformance(r.rows[0]) : null;
}

export async function finalizePerformance(
  pool: Pool,
  tenantId: string,
  portfolioId: string,
  periodLabel: string,
  finalizedBy?: string
): Promise<PerformanceRow | null> {
  const now = new Date().toISOString();
  const r = await pool.query(
    `UPDATE portfolio_performance SET status = 'finalized', finalized_at = $4, finalized_by = $5
     WHERE tenant_id = $1 AND portfolio_id = $2 AND period_label = $3 RETURNING *`,
    [tenantId, portfolioId, periodLabel, now, finalizedBy ?? null]
  );
  return r.rows[0] ? rowToPerformance(r.rows[0]) : null;
}

function computeCorrectionHash(payload: {
  tenantId: string;
  portfolioId: string;
  periodLabel: string;
  originalPerformanceId: string;
  correctionSnapshot: Record<string, unknown>;
  reason: string;
  previousEntryHash: string | null;
  createdAt: string;
}): string {
  const canonical = JSON.stringify({
    tenantId: payload.tenantId,
    portfolioId: payload.portfolioId,
    periodLabel: payload.periodLabel,
    originalPerformanceId: payload.originalPerformanceId,
    correctionSnapshot: payload.correctionSnapshot,
    reason: payload.reason,
    previousEntryHash: payload.previousEntryHash,
    createdAt: payload.createdAt,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export async function getLatestCorrectionHash(
  pool: Pool,
  tenantId: string,
  portfolioId: string,
  periodLabel: string
): Promise<string | null> {
  const r = await pool.query<{ entry_hash: string }>(
    `SELECT entry_hash FROM portfolio_performance_corrections
     WHERE tenant_id = $1 AND portfolio_id = $2 AND period_label = $3 ORDER BY created_at DESC LIMIT 1`,
    [tenantId, portfolioId, periodLabel]
  );
  return r.rows[0]?.entry_hash ?? null;
}

export async function recordPerformanceCorrection(
  pool: Pool,
  tenantId: string,
  payload: {
    portfolioId: string;
    periodLabel: string;
    originalPerformanceId: string;
    correctionSnapshot: Record<string, unknown>;
    reason: string;
    createdBy?: string;
  }
): Promise<PerformanceCorrectionRow> {
  const id = nextId('corr');
  const now = new Date().toISOString();
  const previousEntryHash = await getLatestCorrectionHash(pool, tenantId, payload.portfolioId, payload.periodLabel);
  const entryHash = computeCorrectionHash({
    tenantId,
    portfolioId: payload.portfolioId,
    periodLabel: payload.periodLabel,
    originalPerformanceId: payload.originalPerformanceId,
    correctionSnapshot: payload.correctionSnapshot,
    reason: payload.reason,
    previousEntryHash,
    createdAt: now,
  });
  await pool.query(
    `INSERT INTO portfolio_performance_corrections (id, tenant_id, portfolio_id, period_label, original_performance_id, correction_snapshot, reason, previous_entry_hash, entry_hash, created_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id,
      tenantId,
      payload.portfolioId,
      payload.periodLabel,
      payload.originalPerformanceId,
      JSON.stringify(payload.correctionSnapshot),
      payload.reason,
      previousEntryHash,
      entryHash,
      now,
      payload.createdBy ?? null,
    ]
  );
  return {
    id,
    tenantId,
    portfolioId: payload.portfolioId,
    periodLabel: payload.periodLabel,
    originalPerformanceId: payload.originalPerformanceId,
    correctionSnapshot: payload.correctionSnapshot,
    reason: payload.reason,
    previousEntryHash,
    entryHash,
    createdAt: now,
    createdBy: payload.createdBy,
  };
}

export async function recordPerformance(pool: Pool, tenantId: string, perf: Omit<PerformanceRow, 'id' | 'createdAt' | 'tenantId' | 'status' | 'finalizedAt' | 'finalizedBy'>): Promise<PerformanceRow | PerformanceCorrectionRow> {
  const existing = await getPerformanceByPeriod(pool, tenantId, perf.portfolioId, perf.periodLabel);
  if (existing && existing.status === 'finalized') {
    const correction = await recordPerformanceCorrection(pool, tenantId, {
      portfolioId: perf.portfolioId,
      periodLabel: perf.periodLabel,
      originalPerformanceId: existing.id,
      correctionSnapshot: {
        totalReturn: perf.totalReturn,
        benchmarkReturn: perf.benchmarkReturn,
        excessReturn: perf.excessReturn,
        sharpeRatio: perf.sharpeRatio,
        sortinoRatio: perf.sortinoRatio,
        beta: perf.beta,
        alpha: perf.alpha,
        volatility: perf.volatility,
        maxDrawdown: perf.maxDrawdown,
      },
      reason: 'Restatement/correction of finalized period',
    });
    return correction;
  }
  const now = new Date().toISOString();
  if (existing) {
    await pool.query(
      `UPDATE portfolio_performance SET total_return = $1, benchmark_return = $2, excess_return = $3, sharpe_ratio = $4, sortino_ratio = $5, beta = $6, alpha = $7, volatility = $8, max_drawdown = $9
       WHERE id = $10 AND tenant_id = $11 RETURNING *`,
      [
        perf.totalReturn ?? null,
        perf.benchmarkReturn ?? null,
        perf.excessReturn ?? null,
        perf.sharpeRatio ?? null,
        perf.sortinoRatio ?? null,
        perf.beta ?? null,
        perf.alpha ?? null,
        perf.volatility ?? null,
        perf.maxDrawdown ?? null,
        existing.id,
        tenantId,
      ]
    );
    const r = await pool.query('SELECT * FROM portfolio_performance WHERE id = $1 AND tenant_id = $2', [existing.id, tenantId]);
    return r.rows[0] ? rowToPerformance(r.rows[0]) : { id: existing.id, tenantId, ...perf, status: 'draft', createdAt: now };
  }
  const id = nextId('perf');
  await pool.query(
    `INSERT INTO portfolio_performance (id, tenant_id, portfolio_id, period_label, status, total_return, benchmark_return, excess_return, sharpe_ratio, sortino_ratio, beta, alpha, volatility, max_drawdown, created_at) VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [id, tenantId, perf.portfolioId, perf.periodLabel, perf.totalReturn ?? null, perf.benchmarkReturn ?? null, perf.excessReturn ?? null, perf.sharpeRatio ?? null, perf.sortinoRatio ?? null, perf.beta ?? null, perf.alpha ?? null, perf.volatility ?? null, perf.maxDrawdown ?? null, now]
  );
  return { id, tenantId, ...perf, status: 'draft', createdAt: now };
}

export async function listPerformance(pool: Pool, tenantId: string, portfolioId: string): Promise<PerformanceRow[]> {
  const r = await pool.query('SELECT * FROM portfolio_performance WHERE tenant_id = $1 AND portfolio_id = $2 ORDER BY period_label DESC', [tenantId, portfolioId]);
  return r.rows.map((row) => rowToPerformance(row));
}
