/**
 * Intercompany reconciliation: compute match/variance from entity A and B lines.
 * Persists results via intercompany_repository when pool is provided.
 */

import type { Pool } from 'pg';
import { plus, minus } from '../utils/decimal.js';
import type {
  IntercompanyPair,
  IntercompanyReconciliationResult,
  IntercompanyReconciliationInput,
  IntercompanyReconciliationStatus,
} from '../types/intercompany.js';
import {
  listIntercompanyPairs,
  getIntercompanyPair,
  createIntercompanyPair,
  createIntercompanyReconciliation,
  getIntercompanyReconciliation,
  listIntercompanyReconciliations,
  updateIntercompanyReconciliationResolution,
} from '../db/repositories/intercompany_repository.js';

const inMemoryPairs = new Map<string, IntercompanyPair[]>();

function netBalance(
  lines: { accountName: string; amount: number; side: 'debit' | 'credit' }[],
  accountName: string
): number {
  let net = 0;
  const key = accountName.trim().toLowerCase();
  for (const line of lines) {
    if (line.accountName.trim().toLowerCase() !== key) continue;
    if (line.side === 'debit') net = plus(net, line.amount);
    else net = minus(net, line.amount);
  }
  return net;
}

export function computeIntercompanyReconciliation(
  pair: IntercompanyPair,
  input: IntercompanyReconciliationInput
): Omit<IntercompanyReconciliationResult, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'> {
  const balanceA = netBalance(input.entityALines, pair.accountNameA);
  const balanceB = netBalance(input.entityBLines, pair.accountNameB);
  const absA = Math.abs(balanceA);
  const absB = Math.abs(balanceB);
  const matchedAmount = Math.min(absA, absB);
  const variance = Math.abs(absA - absB);
  let status: IntercompanyReconciliationStatus = 'matched';
  if (variance > 0.01) status = 'variance';
  if ((absA < 1e-9 && absB > 1e-9) || (absB < 1e-9 && absA > 1e-9)) status = 'missing';
  const varianceDetail =
    variance > 0.01
      ? `Entity A balance ${balanceA.toFixed(2)}, Entity B balance ${balanceB.toFixed(2)}; variance ${variance.toFixed(2)}`
      : undefined;
  return {
    pairId: pair.id,
    periodLabel: input.periodLabel,
    matchedAmount: String(matchedAmount),
    balanceA: String(balanceA),
    balanceB: String(balanceB),
    variance: String(variance),
    status,
    varianceDetail,
  };
}

export async function runAndPersistReconciliation(
  pool: Pool,
  tenantId: string,
  input: IntercompanyReconciliationInput
): Promise<IntercompanyReconciliationResult> {
  const pair = await getIntercompanyPair(pool, input.pairId, tenantId);
  if (!pair) throw new Error('Intercompany pair not found');
  const computed = computeIntercompanyReconciliation(pair, input);
  return createIntercompanyReconciliation(pool, tenantId, {
    ...computed,
    tenantId,
  });
}

export async function listPairs(pool: Pool | null, tenantId: string): Promise<IntercompanyPair[]> {
  if (pool) return listIntercompanyPairs(pool, tenantId);
  const key = tenantId;
  return inMemoryPairs.get(key) ?? [];
}

export async function createPair(
  pool: Pool | null,
  tenantId: string,
  pair: Omit<IntercompanyPair, 'id' | 'createdAt'>
): Promise<IntercompanyPair> {
  if (pool) return createIntercompanyPair(pool, tenantId, pair);
  const id = `icp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const now = new Date().toISOString();
  const full: IntercompanyPair = { ...pair, id, createdAt: now };
  const key = tenantId;
  const list = inMemoryPairs.get(key) ?? [];
  list.push(full);
  inMemoryPairs.set(key, list);
  return full;
}

export async function getPair(
  pool: Pool | null,
  pairId: string,
  tenantId: string
): Promise<IntercompanyPair | null> {
  if (pool) return getIntercompanyPair(pool, pairId, tenantId);
  const list = inMemoryPairs.get(tenantId) ?? [];
  return list.find((p) => p.id === pairId) ?? null;
}

export async function getReconciliation(
  pool: Pool | null,
  id: string,
  tenantId: string
): Promise<IntercompanyReconciliationResult | null> {
  if (!pool) return null;
  return getIntercompanyReconciliation(pool, id, tenantId);
}

export async function listReconciliations(
  pool: Pool | null,
  tenantId: string,
  params?: { periodLabel?: string; pairId?: string; limit?: number }
): Promise<IntercompanyReconciliationResult[]> {
  if (!pool) return [];
  return listIntercompanyReconciliations(pool, tenantId, params);
}

export async function updateReconciliationResolution(
  pool: Pool | null,
  id: string,
  tenantId: string,
  update: { resolution?: string; resolvedBy?: string }
): Promise<IntercompanyReconciliationResult | null> {
  if (!pool) return null;
  return updateIntercompanyReconciliationResolution(pool, id, tenantId, update);
}
