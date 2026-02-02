/**
 * Agentic Plan-Execute-Verify: LLM-generated plan with programmatic verification unchanged.
 * Falls back to fixed plan when LLM fails or API key is missing.
 */

import { runPlanExecuteVerify } from './planExecuteVerify.js';
import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { PlanExecuteVerifyInput } from './planExecuteVerify.js';
import type { FinancialStatementsOutput } from '../types/financial.js';

const PLAN_SYSTEM =
  'You are a CPA. Given the following financial statement build summary, output a brief Plan (2–4 sentences) that states: input used, standards applied, output produced, and that each line is traced to codification. Output only the plan text, no labels.';

function buildSummary(input: PlanExecuteVerifyInput, verificationPassed: boolean): string {
  const tb = input.trialBalance;
  const bs = input.balanceSheet;
  const pl = input.profitAndLoss;
  return JSON.stringify({
    trialBalance: {
      entryCount: tb.entries?.length ?? 0,
      totalDebits: tb.totalDebits,
      totalCredits: tb.totalCredits,
      balances: tb.balances,
    },
    balanceSheet: {
      totalAssets: bs.totalAssets,
      totalLiabilities: bs.totalLiabilities,
      totalEquity: bs.totalEquity,
      balances: bs.balances,
    },
    profitAndLoss: {
      totalRevenue: pl.totalRevenue,
      totalExpenses: pl.totalExpenses,
      netIncome: pl.netIncome,
    },
    verificationPassed,
  });
}

function parsePlan(raw: string): string {
  const trimmed = raw.replace(/^```\w*\n?|\n?```$/g, '').trim();
  return trimmed.length > 0 ? trimmed : '';
}

export type ReasoningChainWithOptionalSummary = FinancialStatementsOutput['reasoningChain'] & {
  verificationSummary?: string;
};

/**
 * Run Plan-Execute-Verify with LLM-generated plan. Verification (V1–V4) stays programmatic.
 * When ANTHROPIC_API_KEY (or other LLM key) is missing or LLM fails, returns fixed plan.
 */
export async function runPlanExecuteVerifyAgentic(
  input: PlanExecuteVerifyInput
): Promise<ReasoningChainWithOptionalSummary> {
  const result = runPlanExecuteVerify(input);
  const summary = buildSummary(input, result.verification.passed);

  const planText = await callLLMWithFallback({
    system: PLAN_SYSTEM,
    prompt: summary,
    maxTokens: 400,
    parse: (raw) => parsePlan(raw),
    fallback: '',
  });

  const plan = planText && planText.length > 0 ? planText : result.plan;
  const planSource = planText && planText.length > 0 ? 'llm' : 'fallback';

  const verificationSummary =
    result.verification.passed
      ? `Verification: all checks passed.`
      : `Verification: ${result.verification.checks.join('; ')}`;

  // Observability: one structured log per PEV run (plan source and verification outcome)
  console.info(
    JSON.stringify({
      planSource,
      verificationPassed: result.verification.passed,
      executedAt: result.executedAt,
    })
  );

  return {
    ...result,
    plan,
    verificationSummary,
  };
}
