/**
 * Impairment testing service — CGUs, goodwill allocation, impairment tests (IAS 36 / ASC 350).
 */

import type { Pool } from 'pg';
import * as repo from '../db/repositories/impairment_repository.js';
import type { CGURow, GoodwillAllocationRow, ImpairmentTestRow } from '../db/repositories/impairment_repository.js';
import { round2 } from '../utils/decimal.js';

export type { CGURow, GoodwillAllocationRow, ImpairmentTestRow };

// Re-export repo CRUD
export const createCGU = repo.createCGU;
export const getCGU = repo.getCGU;
export const listCGUs = repo.listCGUs;
export const deleteCGU = repo.deleteCGU;
export const createGoodwillAllocation = repo.createGoodwillAllocation;
export const listGoodwillAllocations = repo.listGoodwillAllocations;
export const getTotalGoodwillForCGU = repo.getTotalGoodwillForCGU;
export const createImpairmentTest = repo.createImpairmentTest;
export const getImpairmentTest = repo.getImpairmentTest;
export const listImpairmentTests = repo.listImpairmentTests;

export interface ImpairmentSummary {
  periodLabel?: string;
  totalImpairmentLoss: number;
  testCount: number;
  byCGU: { cguId: string; cguName: string; totalLoss: number; testCount: number }[];
}

/**
 * Evaluate an impairment test: compare carrying amount vs recoverable amount.
 * Impairment loss = max(0, carrying - recoverable).
 */
export async function evaluateImpairment(
  pool: Pool,
  tenantId: string,
  testId: string
): Promise<ImpairmentTestRow> {
  const test = await repo.getImpairmentTest(pool, tenantId, testId);
  if (!test) throw new Error('Impairment test not found');

  const impairmentLoss = String(round2(Math.max(0, Number(test.carryingAmount) - Number(test.recoverableAmount))));

  // Update the test with computed loss by creating a new record (append-only pattern)
  // Since the repo doesn't have update, we return the test with computed loss
  return { ...test, impairmentLoss };
}

/**
 * Get impairment summary — aggregate tests by CGU with totals.
 */
export async function getImpairmentSummary(
  pool: Pool,
  tenantId: string,
  periodLabel?: string
): Promise<ImpairmentSummary> {
  const tests = await repo.listImpairmentTests(pool, tenantId, periodLabel);
  const cgus = await repo.listCGUs(pool, tenantId);
  const cguMap = new Map(cgus.map((c) => [c.id, c]));

  let totalImpairmentLoss = 0;
  const byCGUMap = new Map<string, { cguName: string; totalLoss: number; testCount: number }>();

  for (const test of tests) {
    const loss = Number(test.impairmentLoss ?? 0) || Math.max(0, Number(test.carryingAmount) - Number(test.recoverableAmount));
    totalImpairmentLoss += loss;

    const cguId = test.cguId ?? 'unassigned';
    const existing = byCGUMap.get(cguId);
    if (existing) {
      existing.totalLoss += loss;
      existing.testCount += 1;
    } else {
      const cgu = cguMap.get(cguId);
      byCGUMap.set(cguId, {
        cguName: cgu?.cguName ?? 'Unassigned',
        totalLoss: Number(loss),
        testCount: 1,
      });
    }
  }

  return {
    periodLabel,
    totalImpairmentLoss: round2(totalImpairmentLoss),
    testCount: tests.length,
    byCGU: Array.from(byCGUMap.entries()).map(([cguId, data]) => ({ cguId, ...data })),
  };
}
