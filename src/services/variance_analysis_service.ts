/**
 * Variance analysis service: compute, explain, approve, gate.
 * Variance change_amount and change_percentage are DB-generated.
 */

import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import type { VarianceRecord, ComputeVariancesInput } from '../types/variance_analysis.js';
import * as repo from '../db/repositories/variance_analysis_repository.js';

export interface VarianceCompletenessResult {
  passes: boolean;
  totalMaterial: number;
  explained: number;
  approved: number;
  unexplained: VarianceRecord[];
}

/** Compute variances and store (DB generates change_amount and change_percentage). */
export async function computeVariances(
  pool: Pool,
  input: ComputeVariancesInput
): Promise<VarianceRecord[]> {
  const priorMap = new Map(
    input.priorLines.map((l) => [`${l.statement}:${l.fsLineId}`, l])
  );
  const results: VarianceRecord[] = [];
  const materialPct = input.materialThresholdPct ?? 5;
  for (const curr of input.currentLines) {
    const key = `${curr.statement}:${curr.fsLineId}`;
    const prior = priorMap.get(key);
    const priorAmount = prior?.amount ?? 0;
    const currentAmount = curr.amount;
    const id = randomUUID();
    const rec = await repo.upsertVariance(pool, id, {
      tenantId: input.tenantId,
      closeSessionId: input.closeSessionId,
      periodLabel: input.periodLabel,
      fsLineId: curr.fsLineId,
      statement: curr.statement,
      label: curr.label,
      currentAmount,
      priorAmount,
      materialThresholdPct: materialPct,
    });
    results.push(rec);
  }
  return results;
}

/** Add or update human-entered explanation. */
export async function explainVariance(
  pool: Pool,
  tenantId: string,
  varianceId: string,
  explanation: string
): Promise<VarianceRecord | null> {
  return repo.updateExplanation(pool, tenantId, varianceId, explanation);
}

/** Approve a variance (mark as reviewed). */
export async function approveVariance(
  pool: Pool,
  tenantId: string,
  varianceId: string,
  approvedBy: string
): Promise<VarianceRecord | null> {
  return repo.approveVariance(pool, tenantId, varianceId, approvedBy);
}

/** Check if material variances are explained and (optionally) approved. */
export async function checkVarianceCompleteness(
  pool: Pool,
  tenantId: string,
  closeSessionId: string
): Promise<VarianceCompletenessResult> {
  const all = await repo.listVariancesForSession(pool, tenantId, closeSessionId);
  const material = all.filter((v) => {
    if (v.priorAmount === 0) return Math.abs(v.changeAmount) > 0.01;
    const pct = v.changePercentage ?? 0;
    return Math.abs(pct) >= v.materialThresholdPct;
  });
  const explained = material.filter((v) => v.explanation != null && v.explanation.trim().length > 0);
  const approved = material.filter((v) => v.approvedAt != null);
  const unexplained = material.filter(
    (v) => !v.explanation || v.explanation.trim().length === 0
  );
  return {
    passes: unexplained.length === 0,
    totalMaterial: material.length,
    explained: explained.length,
    approved: approved.length,
    unexplained,
  };
}
