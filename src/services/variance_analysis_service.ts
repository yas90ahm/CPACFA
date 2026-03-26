/**
 * Variance analysis service: compute, explain, approve, gate.
 * Variance change_amount and change_percentage are DB-generated.
 */

import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import type { VarianceRecord, ComputeVariancesInput } from '../types/variance_analysis.js';
import * as repo from '../db/repositories/variance_analysis_repository.js';
import { appendEntry } from '../db/repositories/audit_ledger_repository.js';
import { financialEvents, buildEventPacket } from '../events/financial_event_emitter.js';
import { mul, round2 } from '../utils/decimal.js';

export interface VarianceCompletenessResult {
  passes: boolean;
  totalMaterial: number;
  explained: number;
  approved: number;
  unexplained: VarianceRecord[];
  /** Count of AI-drafted explanations not yet reviewed by a human. */
  unreviewedAi?: number;
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
    const priorAmount: number = prior?.amount ?? 0;
    const currentAmount: number = curr.amount;
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

    // Emit event for material variances
    const isMaterial = priorAmount === 0
      ? Math.abs(currentAmount) > 0.01
      : Math.abs(Number(rec.changePercentage ?? 0)) >= materialPct;
    if (isMaterial) {
      financialEvents.emit('VARIANCE_DETECTED', buildEventPacket('VARIANCE_DETECTED', {
        errorCode: 'MATERIAL_VARIANCE',
        conflictingData: { currentAmount, priorAmount, changeAmount: rec.changeAmount, changePercentage: rec.changePercentage },
        metadata: {
          tenantId: input.tenantId,
          closeSessionId: input.closeSessionId,
          periodLabel: input.periodLabel,
          accountCodes: [curr.fsLineId],
        },
        data: {
          varianceId: rec.id,
          fsLineId: curr.fsLineId,
          lineItemName: curr.label ?? curr.fsLineId,
          statement: curr.statement,
          currentAmount,
          priorAmount,
          changeAmount: Number(rec.changeAmount ?? 0),
          changePercentage: Number(rec.changePercentage ?? 0),
          materialThresholdPct: materialPct,
        },
      }));
    }
  }
  return results;
}

/** Add or update human-entered explanation with AI audit trail. */
export async function explainVariance(
  pool: Pool,
  tenantId: string,
  varianceId: string,
  explanation: string,
  explanationSource?: 'manual' | 'ai_draft' | 'ai_edited'
): Promise<VarianceRecord | null> {
  const before = await repo.getVarianceById(pool, tenantId, varianceId);
  if (!before) return null;

  const result = await repo.updateExplanation(pool, tenantId, varianceId, explanation, explanationSource);

  // Write audit ledger event for AI-related explanation sources
  if (explanationSource && explanationSource !== 'manual') {
    const eventType = explanationSource === 'ai_draft'
      ? 'ai_variance_draft_accepted' as const
      : 'ai_variance_draft_edited' as const;
    try {
      await appendEntry(pool, {
        tenantId,
        eventType,
        deterministicFlagSnapshot: {
          varianceId,
          fsLineId: before.fsLineId,
          statement: before.statement,
          changeAmount: before.changeAmount,
          changePercentage: before.changePercentage,
        },
        userPromptRationale: explanationSource === 'ai_draft'
          ? 'AI draft accepted as-is'
          : 'AI draft edited by human before submission',
        beforeState: { aiDraftExplanation: before.aiDraftExplanation ?? null },
        afterState: { explanation, explanationSource },
      });
    } catch (_) {
      /* non-fatal: audit event write failed */
    }
  }

  return result;
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
  const direction = Number(v.changeAmount) >= 0 ? 'increased' : 'decreased';
  const absChange = Math.abs(Number(v.changeAmount)).toLocaleString();
  const absPct = v.changePercentage != null ? Math.abs(Number(v.changePercentage)).toFixed(1) : '';
  const currentStr = Number(v.currentAmount).toLocaleString();
  const priorStr = Number(v.priorAmount).toLocaleString();
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

/**
 * Classify a variance with a type label and optionally compute full-year impact.
 * fullYearImpact = monthlyVariance x remainingMonths (uses Decimal.js).
 */
export async function classifyVariance(
  pool: Pool,
  tenantId: string,
  varianceId: string,
  varianceType: string,
  fullYearImpact?: number | null
): Promise<VarianceRecord | null> {
  return repo.classifyVariance(pool, tenantId, varianceId, varianceType, fullYearImpact ?? null);
}

/**
 * Compute the projected full-year impact for a variance.
 * fullYearImpact = monthlyVariance x remainingMonths.
 * periodLabel is YYYY-MM; fiscal year end month defaults to 12 (December).
 */
export function computeFullYearImpact(
  monthlyVariance: number,
  periodLabel: string,
  fiscalYearEndMonth: number = 12
): number {
  const currentMonth = parseInt(periodLabel.slice(5, 7), 10) || 1;
  // Remaining months in the fiscal year (inclusive of current)
  let remaining: number;
  if (currentMonth <= fiscalYearEndMonth) {
    remaining = fiscalYearEndMonth - currentMonth;
  } else {
    remaining = 12 - currentMonth + fiscalYearEndMonth;
  }
  // At minimum 0 remaining months
  if (remaining < 0) remaining = 0;
  return mul(monthlyVariance, remaining);
}

/** Check if material variances are explained and (optionally) approved. */
export async function checkVarianceCompleteness(
  pool: Pool,
  tenantId: string,
  closeSessionId: string
): Promise<VarianceCompletenessResult> {
  const all = await repo.listVariancesForSession(pool, tenantId, closeSessionId);
  const material = all.filter((v) => {
    if (Number(v.priorAmount) === 0) return Math.abs(Number(v.changeAmount)) > 0.01;
    const pct = Number(v.changePercentage ?? 0);
    return Math.abs(pct) >= Number(v.materialThresholdPct);
  });
  const explained = material.filter((v) => v.explanation != null && v.explanation.trim().length > 0);
  const approved = material.filter((v) => v.approvedAt != null);
  const unexplained = material.filter(
    (v) => !v.explanation || v.explanation.trim().length === 0
  );
  // AI-drafted explanations require explicit human review attestation
  const unreviewedAi = explained.filter(
    (v) => v.explanationSource === 'ai_draft' && !v.humanReviewedBy
  );
  return {
    passes: unexplained.length === 0 && unreviewedAi.length === 0,
    totalMaterial: material.length,
    explained: explained.length,
    approved: approved.length,
    unexplained,
    unreviewedAi: unreviewedAi.length,
  };
}
