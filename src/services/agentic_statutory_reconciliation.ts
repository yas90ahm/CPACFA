/**
 * Agentic narrative for statutory vs management reconciliation.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { StatutoryReconciliationResult } from '../types/statutory_view.js';

const SYSTEM = [
  'You are a CFO analyst. Given a reconciliation between management and statutory (local GAAP) amounts,',
  'write 2–4 sentences explaining the main differences and why they arise. Return plain text only.',
].join(' ');

export async function explainStatutoryReconciliationAgentic(
  result: StatutoryReconciliationResult
): Promise<string> {
  const material = result.lines.filter((l) => Math.abs(l.difference) > 0.01);
  if (material.length === 0) {
    return `Management and statutory views are aligned for ${result.periodLabel}.`;
  }
  const prompt = [
    `Period: ${result.periodLabel}.`,
    'Material differences:',
    ...material.map(
      (l) =>
        `  ${l.label}: Management ${l.managementAmount}, Statutory ${l.statutoryAmount}, Difference ${l.difference}${l.differencePercent != null ? ` (${l.differencePercent >= 0 ? '+' : ''}${l.differencePercent.toFixed(1)}%)` : ''}.`
    ),
    result.totalDifference != null ? `Total difference: ${result.totalDifference}.` : '',
    'Explain why these differences arise (e.g. different recognition, reclassifications).',
  ].join('\n');

  const fallback = `Statutory vs management reconciliation for ${result.periodLabel}: ${material.length} line(s) with differences. Total difference: ${result.totalDifference ?? 'N/A'}.`;
  return callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 256,
    parse: (raw) => (raw?.trim() ?? '') || fallback,
    fallback,
  });
}

export interface StatutoryAdjustmentSuggestion {
  description: string;
  amount?: number;
  rationale: string;
  confidence: number;
}

/**
 * Suggest high-level adjustments for management-to-statutory reconciliation (e.g. local GAAP differences).
 */
export async function suggestStatutoryAdjustmentsAgentic(params: {
  managementSummary: string;
  jurisdiction?: string;
}): Promise<{ suggestions: StatutoryAdjustmentSuggestion[] }> {
  const systemPrompt = `You are a statutory/GAAP specialist. Given a management view summary and jurisdiction, suggest common adjustments for management-to-statutory (local GAAP) reconciliation. Return JSON: { "suggestions": [ { "description": "...", "amount": X or null, "rationale": "...", "confidence": 0.X } ] }`;
  const userContent = `Management summary: ${params.managementSummary}\nJurisdiction: ${params.jurisdiction ?? 'not specified'}`;
  const fallback = { suggestions: [] as StatutoryAdjustmentSuggestion[] };
  return callLLMWithFallback({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 600,
    parse: (raw: string) => {
      try {
        const parsed = JSON.parse(raw);
        const arr = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
        return {
          suggestions: arr.map((s: Record<string, unknown>) => ({
            description: String(s.description ?? ''),
            amount: typeof s.amount === 'number' ? s.amount : undefined,
            rationale: String(s.rationale ?? ''),
            confidence: typeof s.confidence === 'number' ? s.confidence : 0.5,
          })),
        };
      } catch {
        return fallback;
      }
    },
    fallback,
  });
}
