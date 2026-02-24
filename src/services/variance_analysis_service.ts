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

/** Generate a deterministic draft variance explanation. Advisory; human edits and submits. */
export function generateVarianceDraftExplanation(v: VarianceRecord): string {
  const lineName = v.label ?? v.fsLineId ?? 'Line item';
  const direction = v.changeAmount >= 0 ? 'increased' : 'decreased';
  const absChange = Math.abs(v.changeAmount).toLocaleString();
  const absPct = v.changePercentage != null ? Math.abs(v.changePercentage).toFixed(1) : '';
  const currentStr = v.currentAmount.toLocaleString();
  const priorStr = v.priorAmount.toLocaleString();
  let draft = `${lineName} ${direction} by $${absChange}`;
  if (absPct) draft += ` (${absPct}%)`;
  draft += ` compared to the prior period. Current period balance: $${currentStr}. Prior period balance: $${priorStr}. [Please provide specific drivers for this change.]`;
  return draft;
}

/** Get AI draft explanation (cached or generate deterministic fallback). Graceful degradation. */
export async function getVarianceAiDraft(
  pool: Pool,
  tenantId: string,
  varianceId: string
): Promise<{
  varianceId: string;
  draftExplanation: string | null;
  generatedAt: string | null;
  cached: boolean;
  error?: string;
}> {
  const variance = await repo.getVarianceById(pool, tenantId, varianceId);
  if (!variance) throw new Error('Variance not found');
  if (variance.aiDraftExplanation) {
    return { varianceId, draftExplanation: variance.aiDraftExplanation, generatedAt: variance.createdAt, cached: true };
  }
  try {
    const draft = generateVarianceDraftExplanation(variance);
    // Do NOT auto-save to database. Return draft for human review; controller saves explicitly.
    return { varianceId, draftExplanation: draft, generatedAt: new Date().toISOString(), cached: false };
  } catch {
    return {
      varianceId,
      draftExplanation: null,
      generatedAt: null,
      cached: false,
      error: 'Unable to generate AI draft at this time. Please write the explanation manually.',
    };
  }
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
