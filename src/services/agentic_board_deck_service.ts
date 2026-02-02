/**
 * Board deck: slide-ready structure (title + bullets) from one-pager/KPIs — agentic.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { BoardDeckResult, BoardSlide } from '../types/board_deck.js';
import type { CFOFinancialSnapshot } from '../types/cfo-dashboard.js';
import type { CFOKPIs } from '../types/cfo-dashboard.js';

const SYSTEM = [
  'You are a CFO preparing a board deck. Given a one-pager narrative and KPIs (or snapshot summary),',
  'produce 4–6 slides as a JSON array: [{"title":"...","bullets":["...","..."]}].',
  'Slides might be: Executive Summary, Financial Highlights, P&L Summary, Cash & Runway, Key Metrics, Risks/Outlook.',
  'Each slide has "title" and "bullets" (array of short strings). Return only the JSON array, no other text.',
].join(' ');

export interface BoardDeckInput {
  onePagerNarrative?: string;
  kpis?: CFOKPIs;
  snapshot?: CFOFinancialSnapshot;
  periodLabel?: string;
}

/**
 * Generate board deck (slides with title + bullets) from one-pager/KPIs using LLM.
 */
export async function generateBoardDeckAgentic(input: BoardDeckInput): Promise<BoardDeckResult> {
  const { onePagerNarrative, kpis, snapshot, periodLabel = 'Current' } = input;
  const parts: string[] = [];
  if (onePagerNarrative) parts.push(`One-pager: ${onePagerNarrative.slice(0, 1500)}`);
  if (kpis) {
    parts.push(
      `KPIs: Burn $${(kpis.burnRate / 1000).toFixed(1)}k/mo, Runway ${kpis.runwayMonths} mo, Rule of 40 ${kpis.ruleOf40}, Gross margin ${kpis.grossMarginPercent}%, Net margin ${kpis.netMarginPercent}%.`
    );
  }
  if (snapshot) {
    parts.push(
      `Snapshot: Revenue ${snapshot.revenue}, Net Income ${snapshot.netIncome}, Cash ${snapshot.cash}, OpEx ${snapshot.operatingExpenses ?? 'N/A'}.`
    );
  }
  const prompt = [
    `Period: ${periodLabel}.`,
    parts.length ? parts.join('\n') : 'No narrative or KPIs provided.',
    'Produce 4–6 board slides as JSON array: [{"title":"...","bullets":["..."]}].',
  ].join('\n');

  const fallbackSlides: BoardSlide[] = [
    { title: 'Executive Summary', bullets: [onePagerNarrative?.slice(0, 200) ?? 'No narrative.'] },
    {
      title: 'Key Metrics',
      bullets: kpis
        ? [
            `Runway: ${kpis.runwayMonths} months`,
            `Burn rate: $${(kpis.burnRate / 1000).toFixed(1)}k/mo`,
            `Rule of 40: ${kpis.ruleOf40}%`,
            `Gross margin: ${kpis.grossMarginPercent}%; Net margin: ${kpis.netMarginPercent}%`,
          ]
        : ['No KPI data.'],
    },
  ];
  const fallbackResult: BoardDeckResult = {
    periodLabel,
    slides: fallbackSlides,
    generatedAt: new Date().toISOString(),
  };

  return callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 1024,
    parse: (raw) => {
      const match = raw.match(/\[[\s\S]*?\]/);
      const arr = match ? JSON.parse(match[0]) : [];
      const slides: BoardSlide[] = (Array.isArray(arr) ? arr : []).slice(0, 8).map((s: Record<string, unknown>) => ({
        title: String(s.title ?? 'Slide'),
        bullets: Array.isArray(s.bullets) ? s.bullets.map((b) => String(b)).slice(0, 6) : [],
      }));
      return {
        periodLabel,
        slides: slides.length ? slides : [{ title: 'Executive Summary', bullets: ['No content generated.'] }],
        generatedAt: new Date().toISOString(),
      };
    },
    fallback: fallbackResult,
  });
}
