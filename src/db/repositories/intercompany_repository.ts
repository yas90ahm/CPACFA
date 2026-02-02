/**
 * Intercompany pairs and reconciliation results — tenant-scoped.
 */

import type { Pool } from 'pg';
import type { IntercompanyPair, IntercompanyReconciliationResult } from '../../types/intercompany.js';

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function createIntercompanyPair(
  pool: Pool,
  tenantId: string,
  pair: Omit<IntercompanyPair, 'id' | 'createdAt'>
): Promise<IntercompanyPair> {
  const id = nextId('icp');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO intercompany_pairs (id, tenant_id, entity_a_id, entity_b_id, account_name_a, account_name_b, name, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      tenantId,
      pair.entityAId,
      pair.entityBId,
      pair.accountNameA,
      pair.accountNameB,
      pair.name ?? null,
      now,
    ]
  );
  return { ...pair, id, createdAt: now };
}

export async function getIntercompanyPair(
  pool: Pool,
  id: string,
  tenantId: string
): Promise<IntercompanyPair | null> {
  const r = await pool.query<{
    id: string;
    entity_a_id: string;
    entity_b_id: string;
    account_name_a: string;
    account_name_b: string;
    name: string | null;
    created_at: string;
  }>('SELECT id, entity_a_id, entity_b_id, account_name_a, account_name_b, name, created_at FROM intercompany_pairs WHERE id = $1 AND tenant_id = $2', [
    id,
    tenantId,
  ]);
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    entityAId: row.entity_a_id,
    entityBId: row.entity_b_id,
    accountNameA: row.account_name_a,
    accountNameB: row.account_name_b,
    name: row.name ?? undefined,
    createdAt: row.created_at,
  };
}

export async function listIntercompanyPairs(pool: Pool, tenantId: string): Promise<IntercompanyPair[]> {
  const r = await pool.query<{
    id: string;
    entity_a_id: string;
    entity_b_id: string;
    account_name_a: string;
    account_name_b: string;
    name: string | null;
    created_at: string;
  }>('SELECT id, entity_a_id, entity_b_id, account_name_a, account_name_b, name, created_at FROM intercompany_pairs WHERE tenant_id = $1 ORDER BY created_at', [
    tenantId,
  ]);
  return r.rows.map((row) => ({
    id: row.id,
    entityAId: row.entity_a_id,
    entityBId: row.entity_b_id,
    accountNameA: row.account_name_a,
    accountNameB: row.account_name_b,
    name: row.name ?? undefined,
    createdAt: row.created_at,
  }));
}

export async function createIntercompanyReconciliation(
  pool: Pool,
  tenantId: string,
  rec: Omit<IntercompanyReconciliationResult, 'id' | 'createdAt' | 'updatedAt'>
): Promise<IntercompanyReconciliationResult> {
  const id = nextId('icr');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO intercompany_reconciliation_results (id, tenant_id, pair_id, period_label, matched_amount, balance_a, balance_b, variance, status, variance_detail, resolution, resolved_at, resolved_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      id,
      tenantId,
      rec.pairId,
      rec.periodLabel,
      rec.matchedAmount,
      rec.balanceA,
      rec.balanceB,
      rec.variance,
      rec.status,
      rec.varianceDetail ?? null,
      rec.resolution ?? null,
      rec.resolvedAt ?? null,
      rec.resolvedBy ?? null,
      now,
      now,
    ]
  );
  return {
    ...rec,
    id,
    tenantId,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getIntercompanyReconciliation(
  pool: Pool,
  id: string,
  tenantId: string
): Promise<IntercompanyReconciliationResult | null> {
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    pair_id: string;
    period_label: string;
    matched_amount: number;
    balance_a: number;
    balance_b: number;
    variance: number;
    status: string;
    variance_detail: string | null;
    resolution: string | null;
    resolved_at: string | null;
    resolved_by: string | null;
    created_at: string;
    updated_at: string;
  }>(
    'SELECT id, tenant_id, pair_id, period_label, matched_amount, balance_a, balance_b, variance, status, variance_detail, resolution, resolved_at, resolved_by, created_at, updated_at FROM intercompany_reconciliation_results WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    pairId: row.pair_id,
    periodLabel: row.period_label,
    matchedAmount: Number(row.matched_amount),
    balanceA: Number(row.balance_a),
    balanceB: Number(row.balance_b),
    variance: Number(row.variance),
    status: row.status as IntercompanyReconciliationResult['status'],
    varianceDetail: row.variance_detail ?? undefined,
    resolution: row.resolution ?? undefined,
    resolvedAt: row.resolved_at ?? undefined,
    resolvedBy: row.resolved_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listIntercompanyReconciliations(
  pool: Pool,
  tenantId: string,
  params?: { periodLabel?: string; pairId?: string; limit?: number }
): Promise<IntercompanyReconciliationResult[]> {
  let sql =
    'SELECT id, tenant_id, pair_id, period_label, matched_amount, balance_a, balance_b, variance, status, variance_detail, resolution, resolved_at, resolved_by, created_at, updated_at FROM intercompany_reconciliation_results WHERE tenant_id = $1';
  const args: unknown[] = [tenantId];
  let i = 2;
  if (params?.periodLabel) {
    sql += ` AND period_label = $${i}`;
    args.push(params.periodLabel);
    i += 1;
  }
  if (params?.pairId) {
    sql += ` AND pair_id = $${i}`;
    args.push(params.pairId);
    i += 1;
  }
  sql += ' ORDER BY created_at DESC';
  if (params?.limit != null) {
    sql += ` LIMIT $${i}`;
    args.push(params.limit);
  }
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    pair_id: string;
    period_label: string;
    matched_amount: number;
    balance_a: number;
    balance_b: number;
    variance: number;
    status: string;
    variance_detail: string | null;
    resolution: string | null;
    resolved_at: string | null;
    resolved_by: string | null;
    created_at: string;
    updated_at: string;
  }>(sql, args);
  return r.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    pairId: row.pair_id,
    periodLabel: row.period_label,
    matchedAmount: Number(row.matched_amount),
    balanceA: Number(row.balance_a),
    balanceB: Number(row.balance_b),
    variance: Number(row.variance),
    status: row.status as IntercompanyReconciliationResult['status'],
    varianceDetail: row.variance_detail ?? undefined,
    resolution: row.resolution ?? undefined,
    resolvedAt: row.resolved_at ?? undefined,
    resolvedBy: row.resolved_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function updateIntercompanyReconciliationResolution(
  pool: Pool,
  id: string,
  tenantId: string,
  update: { resolution?: string; resolvedBy?: string }
): Promise<IntercompanyReconciliationResult | null> {
  const now = new Date().toISOString();
  await pool.query(
    `UPDATE intercompany_reconciliation_results SET resolution = COALESCE($3, resolution), resolved_by = COALESCE($4, resolved_by), resolved_at = $5, updated_at = $5 WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId, update.resolution ?? null, update.resolvedBy ?? null, now]
  );
  return getIntercompanyReconciliation(pool, id, tenantId);
}
