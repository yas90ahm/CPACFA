/**
 * CFO Dashboard — Agentic MD&A narrative (LLM-enhanced, Stage 4).
 * Enriches or generates MD&A commentary from financial snapshot and KPIs.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { CFOFinancialSnapshot, CFOKPIs, MDANarrative } from '../types/cfo-dashboard.js';
import { generateMDANarrative } from './executive_summarizer.js';

const SYSTEM = [
  'You are a CFO-level writer producing Management Discussion and Analysis (MD&A) for investors and the board.',
  'Write in a professional, concise tone. Use the provided financial snapshot and KPIs.',
  'Return valid JSON only, with this exact structure:',
  '{ "overview": string, "sections": [ { "title": string, "content": string } ], "highlights": string[] }.',
  'Overview: 2–4 sentences. Sections: at least "Results of Operations" and "Liquidity and Capital Resources". Highlights: 3–5 bullet-style takeaways.',
].join(' ');

export interface AgenticMDAInput {
  snapshot: CFOFinancialSnapshot;
  kpis: CFOKPIs;
  /** Optional template from rule-based MD&A to enrich */
  templateNarrative?: MDANarrative;
  periodLabel?: string;
}

/**
 * Generate MD&A narrative using LLM. Falls back to rule-based narrative if LLM fails.
 */
export async function generateMDANarrativeAgentic(input: AgenticMDAInput): Promise<MDANarrative> {
  const { snapshot, kpis, templateNarrative, periodLabel } = input;
  const period = periodLabel ?? snapshot.periodLabel ?? 'Current Period';

  const prompt = [
    'Financial snapshot (key figures):',
    JSON.stringify({
      revenue: snapshot.revenue,
      costOfGoodsSold: snapshot.costOfGoodsSold,
      operatingExpenses: snapshot.operatingExpenses,
      netIncome: snapshot.netIncome,
      totalAssets: snapshot.totalAssets,
      totalLiabilities: snapshot.totalLiabilities,
      totalEquity: snapshot.totalEquity,
      cash: snapshot.cash,
      priorRevenue: snapshot.priorRevenue,
      priorNetIncome: snapshot.priorNetIncome,
    }),
    '',
    'KPIs:',
    JSON.stringify({
      burnRate: kpis.burnRate,
      runwayMonths: kpis.runwayMonths,
      ruleOf40: kpis.ruleOf40,
      revenueGrowthPercent: kpis.revenueGrowthPercent,
      profitMarginPercent: kpis.profitMarginPercent,
      grossMarginPercent: kpis.grossMarginPercent,
      operatingMarginPercent: kpis.operatingMarginPercent,
      netMarginPercent: kpis.netMarginPercent,
      workingCapitalCycleDays: kpis.workingCapitalCycleDays,
      roicPercent: kpis.roicPercent,
    }),
    '',
    templateNarrative
      ? `Existing draft to enrich (keep facts, improve clarity and insight):\n${JSON.stringify(templateNarrative)}`
      : 'Generate MD&A from scratch.',
    '',
    'Return JSON only.',
  ].join('\n');

  const result = await callLLMWithFallback<MDANarrative | null>({
    system: SYSTEM,
    prompt,
    maxTokens: 2048,
    parse: (raw) => {
      const parsed = parseMDAResponse(raw);
      if (!parsed) return null;
      return {
        periodLabel: period,
        overview: parsed.overview ?? '',
        sections: Array.isArray(parsed.sections) ? parsed.sections : [],
        highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
      };
    },
    fallback: null,
  });

  if (result) return result;
  return generateMDANarrative(snapshot, kpis);
}

function parseMDAResponse(raw: string): {
  overview?: string;
  sections?: Array<{ title: string; content: string }>;
  highlights?: string[];
} | null {
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    const slice = raw.slice(start, end + 1);
    const parsed = JSON.parse(slice) as unknown;
    if (parsed && typeof parsed === 'object') {
      return parsed as { overview?: string; sections?: Array<{ title: string; content: string }>; highlights?: string[] };
    }
  } catch {
    /* ignore */
  }
  return null;
}
