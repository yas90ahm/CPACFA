/**
 * Risk context liquidity warnings — CFA liquidity (Integration).
 * Persisted when pool available; used for valuation prompts.
 */

import type { Pool } from 'pg';

function nextId(): string {
  return `rcl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export interface RiskContextLiquidityRow {
  id: string;
  tenantId: string;
  periodLabel: string | null;
  sessionId: string | null;
  source: string;
  riskLevel: string | null;
  currentRatio: number | null;
  runwayMonths: number | null;
  message: string;
  createdAt: string;
}

export interface CreateRiskContextLiquidityInput {
  tenantId: string;
  periodLabel?: string;
  sessionId?: string;
  source: string;
  riskLevel?: string;
  currentRatio?: number;
  runwayMonths?: number;
  message: string;
}

export async function create(
  pool: Pool,
  input: CreateRiskContextLiquidityInput
): Promise<RiskContextLiquidityRow> {
  const id = nextId();
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO risk_context_liquidity_warnings (
      id, tenant_id, period_label, session_id, source, risk_level, current_ratio, runway_months, message, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      input.tenantId,
      input.periodLabel ?? null,
      input.sessionId ?? null,
      input.source,
      input.riskLevel ?? null,
      input.currentRatio ?? null,
      input.runwayMonths ?? null,
      input.message,
      now,
    ]
  );
  return {
    id,
    tenantId: input.tenantId,
    periodLabel: input.periodLabel ?? null,
    sessionId: input.sessionId ?? null,
    source: input.source,
    riskLevel: input.riskLevel ?? null,
    currentRatio: input.currentRatio ?? null,
    runwayMonths: input.runwayMonths ?? null,
    message: input.message,
    createdAt: now,
  };
}

export async function listByTenantPeriod(
  pool: Pool,
  tenantId: string,
  periodLabel?: string
): Promise<RiskContextLiquidityRow[]> {
  let sql =
    'SELECT id, tenant_id, period_label, session_id, source, risk_level, current_ratio, runway_months, message, created_at FROM risk_context_liquidity_warnings WHERE tenant_id = $1';
  const args: unknown[] = [tenantId];
  if (periodLabel != null) {
    args.push(periodLabel);
    sql += ' AND period_label = $2';
  }
  sql += ' ORDER BY created_at DESC';
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    period_label: string | null;
    session_id: string | null;
    source: string;
    risk_level: string | null;
    current_ratio: string | null;
    runway_months: number | null;
    message: string;
    created_at: string;
  }>(sql, args);
  return r.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    periodLabel: row.period_label ?? null,
    sessionId: row.session_id ?? null,
    source: row.source,
    riskLevel: row.risk_level ?? null,
    currentRatio: row.current_ratio != null ? Number(row.current_ratio) : null,
    runwayMonths: row.runway_months ?? null,
    message: row.message,
    createdAt: row.created_at,
  }));
}
