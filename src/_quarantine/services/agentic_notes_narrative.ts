/**
 * Agentic entity-specific narrative for notes and accounting policies (MD&A or note header).
 * Wraps or emphasizes registry-based notes given standard and optional context.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import { getStandardsRegistry } from '../constants/accounting/index.js';
import type { AccountingStandard } from '../constants/accounting/index.js';

const SYSTEM = [
  'You are a financial reporting specialist. Given an accounting standard and a summary of the entity\'s accounting policy notes (from the registry),',
  'write a short narrative (1-2 paragraphs) suitable for MD&A or a note header: emphasize how policies apply to the entity.',
  'If context is provided (e.g. material leases, high FX exposure), weave it in. Return plain text only, no JSON.',
].join(' ');

/**
 * Build a short summary string from registry notes (titles + descriptions).
 */
export function buildRegistryNotesSummary(standard: AccountingStandard): string {
  const registry = getStandardsRegistry(standard);
  const parts: string[] = [];
  for (const p of registry.revenueRecognition) {
    parts.push(`Revenue: ${p.title}. ${p.description}`);
  }
  for (const p of registry.assetMeasurement) {
    parts.push(`Assets: ${p.title}. ${p.description}`);
  }
  for (const p of registry.leaseAccounting) {
    parts.push(`Leases: ${p.title}. ${p.description}`);
  }
  for (const p of registry.depreciation) {
    parts.push(`Depreciation: ${p.title}. ${p.description}`);
  }
  return parts.length ? parts.join(' ') : 'Accounting policies per applicable standard.';
}

const FALLBACK = '';

/**
 * Generate entity-specific notes narrative. Returns empty string on failure or missing API key.
 */
export async function generateNotesNarrativeAgentic(
  standard: AccountingStandard,
  context?: string
): Promise<string> {
  const registryNotesSummary = buildRegistryNotesSummary(standard);
  const prompt = context
    ? `Standard: ${standard}.\nRegistry summary: ${registryNotesSummary.slice(0, 2000)}\n\nEntity context: ${context}\n\nWrite 1-2 paragraphs for MD&A or note header.`
    : `Standard: ${standard}.\nRegistry summary: ${registryNotesSummary.slice(0, 2000)}\n\nWrite 1-2 paragraphs for MD&A or note header.`;
  return callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 512,
    parse: (raw) => (raw?.trim() ?? '').slice(0, 2000) || FALLBACK,
    fallback: FALLBACK,
  });
}
