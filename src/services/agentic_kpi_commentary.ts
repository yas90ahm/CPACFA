/**
 * CFO Dashboard — Agentic KPI commentary (why burn/runway/Rule of 40 changed vs prior period).
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { CFOFinancialSnapshot, CFOKPIs } from '../types/cfo-dashboard.js';

const SYSTEM = [
  'You are a CFO analyst explaining KPI changes to management.',
  'Given current and prior period snapshots (and KPIs), explain in 3–6 sentences why burn rate, runway, Rule of 40, and margins changed.',
  'Be concise and factual. Return plain text only, no JSON.',
].join(' ');

export interface KPICommentaryInput {
  currentSnapshot: CFOFinancialSnapshot;
  priorSnapshot: CFOFinancialSnapshot;
  currentKpis: CFOKPIs;
  priorKpis?: CFOKPIs;
  periodLabel?: string;
  priorPeriodLabel?: string;
}

/**
 * Generate agentic commentary explaining KPI changes vs prior period.
 */
export async function generateKPICommentaryAgentic(input: KPICommentaryInput): Promise<string> {
  const { currentSnapshot, priorSnapshot, currentKpis, priorKpis, periodLabel, priorPeriodLabel } = input;
  const current = periodLabel ?? currentSnapshot.periodLabel ?? 'Current';
  const prior = priorPeriodLabel ?? priorSnapshot.periodLabel ?? 'Prior';

  const prompt = [
    `Current period (${current}):`,
    `  Revenue ${currentSnapshot.revenue}, Net Income ${currentSnapshot.netIncome}, Cash ${currentSnapshot.cash}, OpEx ${currentSnapshot.operatingExpenses ?? 'N/A'}.`,
    `  KPIs: burn rate ${currentKpis.burnRate}, runway ${currentKpis.runwayMonths} mo, Rule of 40 ${currentKpis.ruleOf40}, gross margin ${currentKpis.grossMarginPercent}%, net margin ${currentKpis.netMarginPercent}%.`,
    `Prior period (${prior}):`,
    `  Revenue ${priorSnapshot.revenue}, Net Income ${priorSnapshot.netIncome}, Cash ${priorSnapshot.cash}, OpEx ${priorSnapshot.operatingExpenses ?? 'N/A'}.`,
    priorKpis
      ? `  KPIs: burn rate ${priorKpis.burnRate}, runway ${priorKpis.runwayMonths} mo, Rule of 40 ${priorKpis.ruleOf40}, gross margin ${priorKpis.grossMarginPercent}%, net margin ${priorKpis.netMarginPercent}%.`
      : '  KPIs not provided.',
    'Explain why burn, runway, Rule of 40, and margins changed between the two periods.',
  ].join('\n');

  const fallback =
    `KPI comparison: ${current} vs ${prior}. ` +
    `Runway ${currentKpis.runwayMonths} mo (burn $${(currentKpis.burnRate / 1000).toFixed(1)}k/mo). ` +
    `Rule of 40 ${currentKpis.ruleOf40.toFixed(1)}%. ` +
    'Review snapshot details for driver analysis.';

  return callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 512,
    parse: (raw) => (raw?.trim() ?? '') || fallback,
    fallback,
  });
}
