/**
 * CFO Dashboard — Board-ready one-pager (agentic executive summary).
 * Single LLM call combining snapshot, KPIs, variance report, and sensitivity report.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type {
  CFOFinancialSnapshot,
  CFOKPIs,
  MDANarrative,
  VarianceReport,
  SensitivityReport,
} from '../types/cfo-dashboard.js';

export interface BoardOnePagerInput {
  snapshot: CFOFinancialSnapshot;
  kpis: CFOKPIs;
  /** Optional */
  mdaNarrative?: MDANarrative;
  varianceReport?: VarianceReport;
  sensitivityReport?: SensitivityReport;
  periodLabel?: string;
}

export interface BoardOnePagerResult {
  periodLabel: string;
  generatedAt: string;
  /** One-page narrative (2–4 paragraphs) */
  narrative: string;
  /** Bullet takeaways (3–6) */
  bullets: string[];
  /** Optional: raw title if we add it */
  title?: string;
}

const SYSTEM = [
  'You are a CFO writing a one-page executive summary for the board.',
  'Combine the provided financial snapshot, KPIs, and any variance/sensitivity context into a single, concise one-pager.',
  'Write 2–4 short paragraphs (narrative) and 3–6 bullet takeaways. Be factual and decision-oriented.',
  'Return ONLY valid JSON: { "narrative": string, "bullets": string[] }.',
].join(' ');

/**
 * Generate a board-ready one-pager from snapshot, KPIs, and optional variance/sensitivity/MD&A.
 */
export async function generateBoardOnePagerAgentic(
  input: BoardOnePagerInput
): Promise<BoardOnePagerResult> {
  const period = input.periodLabel ?? input.snapshot.periodLabel ?? 'Current Period';

  const parts: string[] = [
    'Snapshot:',
    `Revenue ${input.snapshot.revenue}, Net Income ${input.snapshot.netIncome}, Cash ${input.snapshot.cash}, Assets ${input.snapshot.totalAssets}, Equity ${input.snapshot.totalEquity}.`,
    'KPIs:',
    `Burn $${(input.kpis.burnRate / 1000).toFixed(1)}k/mo, Runway ${input.kpis.runwayMonths} mo, Rule of 40 ${input.kpis.ruleOf40}, Gross margin ${input.kpis.grossMarginPercent}%, Net margin ${input.kpis.netMarginPercent}%.`,
  ];

  if (input.mdaNarrative?.overview) {
    parts.push('MD&A overview:', input.mdaNarrative.overview);
  }
  if (input.varianceReport?.summaryNarrative) {
    parts.push('Variance:', input.varianceReport.summaryNarrative);
  }
  if (input.sensitivityReport?.summaryNarrative) {
    parts.push('Sensitivity:', input.sensitivityReport.summaryNarrative);
  }

  const prompt = `Period: ${period}\n\n${parts.join('\n')}\n\nProduce one-pager JSON.`;

  const fallback: BoardOnePagerResult = {
    periodLabel: period,
    generatedAt: new Date().toISOString(),
    narrative: `Financial summary for ${period}: Revenue $${(input.snapshot.revenue / 1000).toFixed(0)}k, Net Income $${(input.snapshot.netIncome / 1000).toFixed(0)}k. Runway ${input.kpis.runwayMonths} months; Rule of 40 ${input.kpis.ruleOf40}.`,
    bullets: [
      `Runway: ${input.kpis.runwayMonths} months at current burn.`,
      `Rule of 40: ${input.kpis.ruleOf40.toFixed(1)}%.`,
      `Net margin: ${input.kpis.netMarginPercent.toFixed(1)}%.`,
    ],
  };

  return callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 1024,
    parse: (raw) => {
      const parsed = parseOnePagerResponse(raw);
      return {
        periodLabel: period,
        generatedAt: new Date().toISOString(),
        narrative: parsed.narrative ?? 'Executive summary not generated.',
        bullets: Array.isArray(parsed.bullets) ? parsed.bullets : [],
        title: parsed.title,
      };
    },
    fallback,
  });
}

function parseOnePagerResponse(raw: string): { narrative?: string; bullets?: string[]; title?: string } {
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) return {};
    return JSON.parse(raw.slice(start, end + 1)) as { narrative?: string; bullets?: string[]; title?: string };
  } catch {
    return {};
  }
}
