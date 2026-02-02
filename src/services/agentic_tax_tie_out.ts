/**
 * Agentic narrative for tax return tie-out (provision vs prior year).
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { TaxReturn } from '../types/tax_statutory.js';

const SYSTEM = [
  'You are a tax provision specialist. Given a tax return with provision snapshot and prior-year figures,',
  'write a short narrative tie-out (2–4 sentences): e.g. "Current tax ties to provision; deferred movement explains balance change."',
  'Return plain text only.',
].join(' ');

export async function explainTaxTieOutAgentic(returnRecord: TaxReturn): Promise<string> {
  const hasProvision = returnRecord.provisionSnapshot && Object.keys(returnRecord.provisionSnapshot).length > 0;
  const hasPrior = returnRecord.priorYearFigures && Object.keys(returnRecord.priorYearFigures).length > 0;
  if (!hasProvision && !hasPrior) {
    return `Tax return ${returnRecord.periodLabel} (${returnRecord.jurisdiction}): no provision or prior-year figures attached for tie-out.`;
  }
  const prompt = [
    `Period: ${returnRecord.periodLabel}. Jurisdiction: ${returnRecord.jurisdiction}.`,
    hasProvision ? `Provision snapshot: ${JSON.stringify(returnRecord.provisionSnapshot)}.` : '',
    hasPrior ? `Prior-year figures: ${JSON.stringify(returnRecord.priorYearFigures)}.` : '',
    'Write a short tie-out narrative.',
  ]
    .filter(Boolean)
    .join('\n');

  const fallback = `Tax return ${returnRecord.periodLabel} ties to provision and prior-year figures. Review current tax and deferred rollforward for consistency.`;
  return callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 256,
    parse: (raw) => (raw?.trim() ?? '') || fallback,
    fallback,
  });
}
