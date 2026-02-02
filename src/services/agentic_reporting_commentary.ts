/**
 * Agentic reporting pack commentary: suggest 2–3 bullet points or a short paragraph
 * for a report/pack given report type and key numbers.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';

export interface SuggestCommentaryInput {
  reportType: string;
  periodLabel?: string;
  keyNumbers?: Record<string, number>;
}

const SYSTEM = [
  'You are a FP&A and reporting specialist. Given a report type and key numbers (e.g. revenue, net income, cash),',
  'suggest 2–3 bullet points or a short paragraph of commentary suitable for a management or board report.',
  'Return JSON only: { "commentary": "short paragraph", "bullets": ["bullet 1", "bullet 2", ...] }.',
  'Commentary can be 2–4 sentences; bullets should be concise. If no key numbers, still suggest relevant high-level commentary.',
].join(' ');

/**
 * Suggest commentary for a report pack. Returns commentary and bullets; fallback empty.
 */
export async function suggestReportingCommentaryAgentic(input: SuggestCommentaryInput): Promise<{
  commentary: string;
  bullets: string[];
}> {
  if (!input?.reportType?.trim()) {
    return { commentary: '', bullets: [] };
  }

  const parts: string[] = [`Report type: ${input.reportType.trim()}.`];
  if (input.periodLabel) parts.push(`Period: ${input.periodLabel}.`);
  if (input.keyNumbers && Object.keys(input.keyNumbers).length > 0) {
    parts.push('Key numbers: ' + Object.entries(input.keyNumbers).map(([k, v]) => `${k}: ${v}`).join('; '));
  }
  const prompt = parts.join(' ') + '\n\nOutput JSON: { "commentary": "...", "bullets": ["...", ...] } only.';

  return callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 512,
    parse: (raw) => {
      const trimmed = raw?.trim() ?? '';
      const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : trimmed;
      try {
        const parsed = JSON.parse(jsonStr) as { commentary?: string; bullets?: string[] };
        const commentary = typeof parsed.commentary === 'string' ? parsed.commentary.slice(0, 1500) : '';
        const bullets = Array.isArray(parsed.bullets)
          ? parsed.bullets.filter((b): b is string => typeof b === 'string').slice(0, 10)
          : [];
        return { commentary, bullets };
      } catch {
        return { commentary: '', bullets: [] };
      }
    },
    fallback: { commentary: '', bullets: [] },
  });
}
