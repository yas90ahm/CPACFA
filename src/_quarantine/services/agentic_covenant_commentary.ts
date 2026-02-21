/**
 * Agentic narrative for covenant monitoring result (debt/EBITDA, interest coverage, headroom).
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { CovenantResult } from './enterprise_m_and_a_financing_service.js';

const SYSTEM = [
  'You are a CFO/financing advisor. Given covenant metrics (debt/EBITDA, interest coverage) and headroom vs thresholds,',
  'write a short narrative (2–4 sentences): state compliance or breach, headroom, and any recommendation. Be concise.',
  'Return only the narrative text, no JSON.',
].join(' ');

/**
 * Generate an agentic narrative interpreting covenant headroom for board/lender reporting.
 */
export async function explainCovenantsAgentic(result: CovenantResult): Promise<string> {
  const parts: string[] = [
    `Debt/EBITDA: ${result.debtToEbitda.toFixed(2)}x${result.thresholds?.maxDebtToEbitda != null ? ` (max ${result.thresholds.maxDebtToEbitda}x)` : ''}.`,
    `Interest coverage: ${result.interestCoverage.toFixed(2)}x${result.thresholds?.minInterestCoverage != null ? ` (min ${result.thresholds.minInterestCoverage}x)` : ''}.`,
  ];
  if (result.debtToEbitdaHeadroom != null) {
    parts.push(`Debt/EBITDA headroom: ${result.debtToEbitdaHeadroom >= 0 ? '+' : ''}${result.debtToEbitdaHeadroom.toFixed(2)}x.`);
  }
  if (result.interestCoverageHeadroom != null) {
    parts.push(`Interest coverage headroom: ${result.interestCoverageHeadroom >= 0 ? '+' : ''}${result.interestCoverageHeadroom.toFixed(2)}x.`);
  }
  if (result.debtToEbitdaBreach || result.interestCoverageBreach) {
    parts.push('At least one covenant is in breach.');
  }

  const prompt = `Covenant monitoring result:\n${parts.join('\n')}\n\nInterpret for board/lender reporting.`;

  const fallback =
    result.debtToEbitdaBreach || result.interestCoverageBreach
      ? `Covenant breach: ${result.debtToEbitdaBreach ? 'Debt/EBITDA over limit. ' : ''}${result.interestCoverageBreach ? 'Interest coverage below minimum.' : ''} Review with lender.`
      : `Covenants in compliance. Debt/EBITDA ${result.debtToEbitda.toFixed(2)}x; interest coverage ${result.interestCoverage.toFixed(2)}x.`;

  return callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 256,
    parse: (raw) => (raw?.trim() ?? '').slice(0, 1200) || 'Covenant metrics computed; see headroom above.',
    fallback,
  });
}
