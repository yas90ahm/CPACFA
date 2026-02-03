/**
 * Close coach agent: given close state (checklist, exceptions, readiness, adjustments, lock),
 * returns the single next best action and reason (1–2 sentences).
 * Used by GET /api/close/coach?periodLabel=...
 */

import type { Pool } from 'pg';
import { callLLMWithFallback } from '../llm/callWithFallback.js';
import { getChecklist } from './checklist_store_service.js';
import { getCloseExceptions } from './close_exceptions_service.js';
import { buildCloseReadiness } from './close_readiness_service.js';
import { listAdjustments } from './close_adjustments_service.js';
import { getPeriodLock } from './period_lock_service.js';
import { getUnadjustedMeta } from './trial_balance_store_service.js';

export interface CloseCoachResult {
  nextAction: string;
  reason: string;
}

const SYSTEM = [
  'You are a CPA close specialist. Given a summary of the current period close state',
  '(checklist progress, open items, readiness, adjustments count, lock status),',
  'respond with the single next best action and a short reason (1–2 sentences).',
  'Respond with a JSON object only: { "nextAction": "string", "reason": "string" }.',
  'Use only these keys. Be concise and actionable.',
].join(' ');

const FALLBACK: CloseCoachResult = {
  nextAction: 'Complete the next open checklist step and review adjustments.',
  reason: 'Continue with the close checklist and post or reject pending adjustments.',
};

function parseResponse(raw: string): CloseCoachResult {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) return FALLBACK;
  try {
    const cleaned = trimmed.replace(/```json?\s*|\s*```/g, '').trim();
    const parsed = JSON.parse(cleaned) as unknown;
    if (!parsed || typeof parsed !== 'object') return FALLBACK;
    const obj = parsed as Record<string, unknown>;
    const nextAction =
      typeof obj.nextAction === 'string' && obj.nextAction.length > 0
        ? obj.nextAction.slice(0, 400)
        : FALLBACK.nextAction;
    const reason =
      typeof obj.reason === 'string' && obj.reason.length > 0
        ? obj.reason.slice(0, 300)
        : FALLBACK.reason;
    return { nextAction, reason };
  } catch {
    return FALLBACK;
  }
}

function serializeState(state: {
  periodLabel: string;
  checklistComplete: number;
  checklistTotal: number;
  incompleteSteps: string[];
  hasTB: boolean;
  adjustmentsCount: number;
  adjustmentsPending: number;
  locked: boolean;
  openItemsSummary: string;
}): string {
  const parts: string[] = [
    `Period: ${state.periodLabel}.`,
    `Checklist: ${state.checklistComplete}/${state.checklistTotal} complete.`,
  ];
  if (state.incompleteSteps.length > 0)
    parts.push(`Incomplete steps: ${state.incompleteSteps.join(', ')}.`);
  parts.push(state.hasTB ? 'Unadjusted TB: yes.' : 'Unadjusted TB: no.');
  parts.push(`Adjustments: ${state.adjustmentsCount} total, ${state.adjustmentsPending} pending.`);
  parts.push(state.locked ? 'Period: locked (closed).' : 'Period: open.');
  if (state.openItemsSummary) parts.push(state.openItemsSummary);
  return parts.join(' ');
}

/**
 * Get close coach recommendation (single next action + reason). Returns fallback on failure or missing API key.
 */
export async function getCloseCoach(
  tenantId: string,
  periodLabel: string,
  pool: Pool | undefined
): Promise<CloseCoachResult> {
  const [checklist, exceptions, readiness, adjustments, lock] = await Promise.all([
    getChecklist(periodLabel, undefined, tenantId, pool ?? undefined),
    getCloseExceptions(tenantId, periodLabel, pool ?? undefined),
    buildCloseReadiness(tenantId, periodLabel, pool ?? undefined, { includeNarrative: false }),
    listAdjustments({ periodLabel }, tenantId, pool ?? undefined),
    getPeriodLock(periodLabel, tenantId, pool ?? undefined),
  ]);
  const tbMeta = await getUnadjustedMeta(tenantId, periodLabel, pool ?? undefined);

  const incompleteSteps = checklist
    .filter((s) => s.status !== 'completed' && s.status !== 'skipped')
    .map((s) => s.label ?? s.id);
  const pendingCount = adjustments.filter((a) => a.status !== 'posted' && a.status !== 'rejected').length;
  const openParts: string[] = [];
  if (exceptions.checklistOverdue?.length)
    openParts.push(`Checklist: ${exceptions.checklistOverdue.map((s) => s.label).join(', ')}.`);
  if (exceptions.recOpen?.length)
    openParts.push(`Reconciliations open: ${exceptions.recOpen.map((r) => r.reconciliationType).join(', ')}.`);
  if (exceptions.disclosurePending?.length)
    openParts.push(`Disclosures pending: ${exceptions.disclosurePending.length}.`);

  const state = {
    periodLabel,
    checklistComplete: checklist.filter((s) => s.status === 'completed' || s.status === 'skipped').length,
    checklistTotal: checklist.length,
    incompleteSteps,
    hasTB: !!tbMeta,
    adjustmentsCount: adjustments.length,
    adjustmentsPending: pendingCount,
    locked: !!lock,
    openItemsSummary: openParts.join(' '),
  };

  const prompt = `Close state:\n${serializeState(state)}\n\nRespond with JSON: { "nextAction": "...", "reason": "..." }.`;
  return callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 256,
    parse: parseResponse,
    fallback: FALLBACK,
  });
}
