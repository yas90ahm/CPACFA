/**
 * Agentic policy inference and change proposal.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { BalanceSheet, ProfitAndLoss } from '../types/financial.js';
import type { QualityCheck } from './quality_checks.js';
import type { DataGap } from '../agents/cpa_brain.js';

export interface PolicyProposal {
  policyArea: string;
  changeDescription: string;
  reasoning: string;
  citation?: string;
  confidence: number;
}

const SYSTEM = [
  'You are a CPA policy reviewer.',
  'Given statements and issues, suggest accounting policy changes or confirmations.',
  'Return ONLY JSON array of proposals with fields:',
  '{ policyArea, changeDescription, reasoning, citation, confidence }.',
  'confidence is 0-1.',
].join(' ');

export async function proposePolicyChangesAgentic(input: {
  standard?: string;
  balanceSheet: BalanceSheet;
  profitAndLoss: ProfitAndLoss;
  qualityChecks: QualityCheck[];
  dataGaps: DataGap[];
}): Promise<PolicyProposal[]> {
  const prompt = [
    `standard=${input.standard ?? 'unknown'}`,
    `balanceSheet=${JSON.stringify({
      totalAssets: input.balanceSheet.totalAssets,
      totalLiabilities: input.balanceSheet.totalLiabilities,
      totalEquity: input.balanceSheet.totalEquity,
    })}`,
    `profitAndLoss=${JSON.stringify({
      totalRevenue: input.profitAndLoss.totalRevenue,
      totalExpenses: input.profitAndLoss.totalExpenses,
      netIncome: input.profitAndLoss.netIncome,
    })}`,
    `qualityChecks=${JSON.stringify(input.qualityChecks)}`,
    `dataGaps=${JSON.stringify(input.dataGaps)}`,
    'Return JSON only.',
  ].join('\n');
  return callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 500,
    parse: parseProposals,
    fallback: [],
  });
}

function parseProposals(raw: string): PolicyProposal[] {
  try {
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    const slice = start >= 0 && end >= 0 ? raw.slice(start, end + 1) : raw;
    const parsed = JSON.parse(slice) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as PolicyProposal[];
  } catch {
    return [];
  }
}
