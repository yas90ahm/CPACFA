/**
 * Prior-period comparison with optional agentic narrative.
 * Material flag uses optional materiality thresholds (from materiality_service when provided).
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type {
  PriorPeriodComparisonInput,
  PriorPeriodComparisonResult,
} from '../types/audit_evidence.js';

const DEFAULT_MATERIAL_THRESHOLD_PERCENT = 10;

export interface PriorPeriodComparisonOptions {
  materialThresholdPercent?: number;
  materialThresholdAmount?: number;
}

export function buildPriorPeriodComparison(
  input: PriorPeriodComparisonInput,
  options?: PriorPeriodComparisonOptions
): PriorPeriodComparisonResult {
  const { currentLines, priorLines, currentPeriodLabel, priorPeriodLabel } = input;
  const materialThresholdPercent =
    options?.materialThresholdPercent ?? DEFAULT_MATERIAL_THRESHOLD_PERCENT;
  const materialThresholdAmount = options?.materialThresholdAmount;
  const priorByLabel = new Map(priorLines.map((l) => [l.label, l.amount]));
  const lines: PriorPeriodComparisonResult['lines'] = [];

  for (const curr of currentLines) {
    const priorAmount = priorByLabel.get(curr.label) ?? 0;
    const change = curr.amount - priorAmount;
    const changePercent =
      priorAmount !== 0 ? (change / Math.abs(priorAmount)) * 100 : (curr.amount !== 0 ? 100 : 0);
    const materialByPercent = Math.abs(changePercent) >= materialThresholdPercent;
    const materialByAmount =
      materialThresholdAmount != null && Math.abs(change) >= materialThresholdAmount;
    const material = materialByPercent || materialByAmount;
    lines.push({
      label: curr.label,
      currentAmount: curr.amount,
      priorAmount,
      change,
      changePercent,
      material,
    });
  }

  return {
    currentPeriodLabel,
    priorPeriodLabel,
    lines,
  };
}

const SYSTEM = [
  'You are a CFO analyst. Given a prior-period comparison (current vs prior amounts and % change),',
  'write 2-4 sentences highlighting material changes. Be factual. Return plain text only.',
].join(' ');

export async function explainPriorPeriodComparisonAgentic(
  result: PriorPeriodComparisonResult
): Promise<string> {
  const materialLines = result.lines.filter((l) => l.material);
  if (materialLines.length === 0) {
    return `No material changes between ${result.priorPeriodLabel} and ${result.currentPeriodLabel}.`;
  }
  const prompt = [
    `${result.priorPeriodLabel} vs ${result.currentPeriodLabel}. Material changes:`,
    ...materialLines.map(
      (l) => `  ${l.label}: ${l.priorAmount} → ${l.currentAmount} (${l.changePercent >= 0 ? '+' : ''}${l.changePercent.toFixed(1)}%)`
    ),
    'Summarize in 2-4 sentences.',
  ].join('\n');
  const fallback = `Material changes: ${materialLines.map((l) => `${l.label} ${l.changePercent >= 0 ? '+' : ''}${l.changePercent.toFixed(1)}%`).join('; ')}.`;
  return callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 256,
    parse: (raw) => (raw?.trim() ?? '') || fallback,
    fallback,
  });
}
