/**
 * Agentic consolidation: suggest elimination rules, generate consolidation footnote.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';

export interface SuggestedEliminationRule {
  debitAccount: string;
  creditAccount: string;
  formula?: string;
  rationale: string;
  confidence: number;
}

export async function suggestEliminationRulesAgentic(params: {
  entityTBs: { entityId: string; accountNames: string[] }[];
  relationshipDescription?: string;
}): Promise<{ rules: SuggestedEliminationRule[] }> {
  const systemPrompt = `You are a consolidation specialist. Given entity trial balance account names and optional relationship description, suggest elimination rules (e.g. IC receivable vs IC payable). Return JSON: { "rules": [ { "debitAccount": "...", "creditAccount": "...", "formula": "sum(account1, account2)" or null, "rationale": "...", "confidence": 0.X } ] }`;
  const userContent = `Entity accounts: ${JSON.stringify(params.entityTBs)}\nRelationship: ${params.relationshipDescription ?? 'not specified'}`;
  const fallback = { rules: [] as SuggestedEliminationRule[] };
  return callLLMWithFallback({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 800,
    parse: (raw: string) => {
      try {
        const parsed = JSON.parse(raw);
        const arr = Array.isArray(parsed.rules) ? parsed.rules : [];
        return {
          rules: arr.map((r: Record<string, unknown>) => ({
            debitAccount: String(r.debitAccount ?? ''),
            creditAccount: String(r.creditAccount ?? ''),
            formula: r.formula != null ? String(r.formula) : undefined,
            rationale: String(r.rationale ?? ''),
            confidence: typeof r.confidence === 'number' ? r.confidence : 0.5,
          })),
        };
      } catch {
        return fallback;
      }
    },
    fallback,
  });
}

export interface ConsolidationFootnoteResult {
  footnote: string;
  summary: string;
}

export async function generateConsolidationFootnoteAgentic(summary: {
  periodLabel?: string;
  reportingCurrency: string;
  entityCount: number;
  eliminationCount: number;
  nciShareOfEquity?: number;
  nciShareOfNetIncome?: number;
}): Promise<ConsolidationFootnoteResult> {
  const systemPrompt = `You are a financial reporting specialist. Generate a concise footnote for consolidation. Include: basis of consolidation, NCI if any, eliminations. Return JSON: { "footnote": "...", "summary": "..." }`;
  const userContent = `Period: ${summary.periodLabel ?? 'current'}\nReporting: ${summary.reportingCurrency}\nEntities: ${summary.entityCount}\nEliminations: ${summary.eliminationCount}\nNCI equity: ${summary.nciShareOfEquity ?? 'N/A'}\nNCI net income: ${summary.nciShareOfNetIncome ?? 'N/A'}`;
  const fallback: ConsolidationFootnoteResult = {
    footnote: `The consolidated financial statements include ${summary.entityCount} entities. Intercompany balances and transactions have been eliminated.${summary.nciShareOfEquity != null ? ` NCI share of equity: ${summary.nciShareOfEquity}.` : ''}`,
    summary: `Consolidation of ${summary.entityCount} entities; ${summary.eliminationCount} eliminations applied.`,
  };
  return callLLMWithFallback({
    system: systemPrompt,
    prompt: userContent,
    maxTokens: 800,
    parse: (raw: string) => {
      const parsed = JSON.parse(raw);
      return {
        footnote: typeof parsed.footnote === 'string' ? parsed.footnote : fallback.footnote,
        summary: typeof parsed.summary === 'string' ? parsed.summary : fallback.summary,
      };
    },
    fallback,
  });
}
