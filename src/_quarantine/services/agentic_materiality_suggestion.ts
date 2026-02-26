/**
 * Optional agentic materiality suggestion: given BS/P&L summary, suggest MaterialitySettings
 * (e.g. "5% of net income = X"). Used only when user asks for a suggestion; fallback = no suggestion.
 * Do not use LLM to decide whether something is material in the close path.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import { assertNoNumericAmountsInAgentOutput } from '../llm/guardrails.js';
import type { MaterialitySettings } from '../types/close_and_controls.js';

export interface FinancialSummary {
  netIncome?: number;
  revenue?: number;
  totalAssets?: number;
  /** Optional text summary of BS/P&L */
  summary?: string;
}

const SYSTEM = [
  'You are an audit/assurance specialist. Given a brief financial summary (e.g. net income, revenue, total assets),',
  'suggest materiality settings: overall materiality (e.g. 5% of net income or revenue), performance materiality, trivial threshold.',
  'Respond with a short JSON object only: { "overallMaterialityPercent": number, "overallMaterialityAmount": number (optional), "performanceMaterialityPercent": number (optional), "trivialThreshold": number (optional), "basis": "net_income" | "revenue" | "total_assets" }.',
  'If basis is net_income and net income is provided, compute overallMaterialityAmount as percent of that. Return only the JSON, no markdown.',
].join(' ');

/**
 * Suggest materiality settings from financial summary. Returns undefined on failure or when no API key.
 */
export async function suggestMaterialityAgentic(summary: FinancialSummary): Promise<MaterialitySettings | undefined> {
  const parts: string[] = [];
  if (summary.netIncome != null) parts.push(`Net income: ${summary.netIncome}`);
  if (summary.revenue != null) parts.push(`Revenue: ${summary.revenue}`);
  if (summary.totalAssets != null) parts.push(`Total assets: ${summary.totalAssets}`);
  if (summary.summary) parts.push(`Summary: ${summary.summary}`);
  if (parts.length === 0) return undefined;

  const prompt = parts.join('\n') + '\nSuggest materiality settings (JSON only).';
  const fallback = '';

  const raw = await callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 256,
    parse: (r) => r?.trim() ?? '',
    fallback,
  });

  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw.replace(/```json?\s*|\s*```/g, '').trim()) as Record<string, unknown>;
    assertNoNumericAmountsInAgentOutput(parsed, 'agentic_materiality_suggestion.suggestMaterialityAgentic');
    const result: MaterialitySettings = {};
    if (typeof parsed.overallMaterialityPercent === 'number') result.overallMaterialityPercent = parsed.overallMaterialityPercent;
    if (typeof parsed.overallMaterialityAmount === 'number') result.overallMaterialityAmount = parsed.overallMaterialityAmount;
    if (typeof parsed.performanceMaterialityPercent === 'number') result.performanceMaterialityPercent = parsed.performanceMaterialityPercent;
    if (typeof parsed.trivialThreshold === 'number') result.trivialThreshold = parsed.trivialThreshold;
    if (parsed.basis === 'net_income' || parsed.basis === 'revenue' || parsed.basis === 'total_assets') result.basis = parsed.basis;
    if (result.overallMaterialityPercent != null && summary.netIncome != null && result.basis === 'net_income') {
      result.overallMaterialityAmount = (summary.netIncome * result.overallMaterialityPercent) / 100;
    }
    if (result.overallMaterialityPercent != null || result.overallMaterialityAmount != null) return result;
    return undefined;
  } catch {
    return undefined;
  }
}
