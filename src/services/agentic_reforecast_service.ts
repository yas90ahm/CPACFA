/**
 * Agentic reforecast: LLM suggests updated forecast from actuals + prior budget.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { ReforecastInput, ReforecastResult } from '../types/budget_forecast.js';
import { buildQuarterlyAnnualProjection } from './forecasting_service.js';

const SYSTEM = [
  'You are a CFO analyst producing a reforecast. Given latest actuals and prior budget/forecast,',
  'suggest updated line amounts (revenue, COGS, OpEx) for the next period. Return a short JSON object:',
  '{"revenue": number, "costOfGoodsSold": number, "operatingExpenses": number, "narrative": "2-3 sentences"}',
  'Use only the numbers and narrative; no other keys.',
].join(' ');

export async function runReforecastAgentic(input: ReforecastInput): Promise<ReforecastResult> {
  const { actualSnapshot, priorBudgetLines, periodLabel, driverOverrides } = input;
  const priorLines = priorBudgetLines ?? [];
  const priorRev = priorLines.find((l) => /revenue|revenue/i.test(l.label))?.amount ?? actualSnapshot.revenue;
  const priorCogs = priorLines.find((l) => /cogs|cost/i.test(l.label))?.amount ?? actualSnapshot.costOfGoodsSold ?? 0;
  const priorOpex = priorLines.find((l) => /opex|operating|expense/i.test(l.label))?.amount ?? actualSnapshot.operatingExpenses ?? 0;

  const prompt = [
    `Period: ${periodLabel}. Latest actuals: Revenue ${actualSnapshot.revenue}, COGS ${actualSnapshot.costOfGoodsSold ?? 'N/A'}, OpEx ${actualSnapshot.operatingExpenses ?? 'N/A'}, Net Income ${actualSnapshot.netIncome}, Cash ${actualSnapshot.cash}.`,
    `Prior budget: Revenue ${priorRev}, COGS ${priorCogs}, OpEx ${priorOpex}.`,
    driverOverrides && Object.keys(driverOverrides).length > 0
      ? `Driver overrides: ${JSON.stringify(driverOverrides)}.`
      : '',
    'Suggest reforecast amounts and a brief narrative.',
  ]
    .filter(Boolean)
    .join('\n');

  const fallbackResult: ReforecastResult = (() => {
    const proj = buildQuarterlyAnnualProjection({
      baseRevenue: actualSnapshot.revenue,
      revenueGrowthPercentPerPeriod: 0,
      fixedOpEx: actualSnapshot.operatingExpenses ?? 0,
      numQuarters: 1,
    });
    const p = proj.periods[0];
    return {
      periodLabel,
      lines: [
        { label: 'Revenue', amount: p.revenue, category: 'Revenue' },
        { label: 'Operating Expenses', amount: p.opEx, category: 'OpEx' },
        { label: 'Net Income', amount: p.netIncome, category: 'Other' },
      ],
      narrative: 'Reforecast fallback: flat revenue and OpEx from latest actuals.',
    };
  })();

  return callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 512,
    parse: (raw) => {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      const revenue = Number(parsed.revenue) ?? actualSnapshot.revenue;
      const costOfGoodsSold = Number(parsed.costOfGoodsSold) ?? actualSnapshot.costOfGoodsSold ?? 0;
      const operatingExpenses = Number(parsed.operatingExpenses) ?? actualSnapshot.operatingExpenses ?? 0;
      const netIncome = revenue - costOfGoodsSold - operatingExpenses;
      return {
        periodLabel,
        lines: [
          { label: 'Revenue', amount: revenue, category: 'Revenue' },
          { label: 'COGS', amount: costOfGoodsSold, category: 'COGS' },
          { label: 'Operating Expenses', amount: operatingExpenses, category: 'OpEx' },
          { label: 'Net Income', amount: netIncome, category: 'Other' },
        ],
        narrative: typeof parsed.narrative === 'string' ? parsed.narrative : 'Reforecast based on latest actuals and prior budget.',
        driverAssumptions: driverOverrides,
      };
    },
    fallback: fallbackResult,
  });
}
