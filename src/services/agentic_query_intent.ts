/**
 * Agentic query intent: natural-language question → suggested datasetId + filters.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';

export interface QueryIntentResult {
  datasetId: string;
  periodLabel?: string;
  entityId?: string;
}

const SYSTEM = [
  'You are a financial data analyst. Given a natural-language question about financial data,',
  'return ONLY a JSON object with optional fields: datasetId (e.g. trial_balance, balance_sheet, profit_and_loss, budget_version, cash_forecast, ar_aging, ap_aging, data_quality_exceptions), periodLabel (e.g. 2025-01, Q4 FY24), entityId.',
  'Use datasetId that best matches the question. If the question asks about runway or burn, use cash_forecast or profit_and_loss. If about revenue/expenses, use profit_and_loss or balance_sheet. No other text.',
].join(' ');

export async function resolveQueryIntentAgentic(question: string): Promise<QueryIntentResult | null> {
  const trimmed = question.trim();
  if (!trimmed) return null;
  const fallback: QueryIntentResult | null = null;
  return callLLMWithFallback({
    system: SYSTEM,
    prompt: `Question: ${trimmed}\n\nReturn JSON: { "datasetId": "...", "periodLabel"?: "...", "entityId"?: "..." }`,
    maxTokens: 128,
    parse: (raw) => {
      const json = raw.replace(/```json?\s*/g, '').replace(/```\s*$/g, '').trim();
      try {
        const o = JSON.parse(json) as Record<string, unknown>;
        const datasetId = typeof o.datasetId === 'string' ? o.datasetId : null;
        if (!datasetId) return null;
        return {
          datasetId,
          periodLabel: typeof o.periodLabel === 'string' ? o.periodLabel : undefined,
          entityId: typeof o.entityId === 'string' ? o.entityId : undefined,
        };
      } catch {
        return null;
      }
    },
    fallback,
  });
}
