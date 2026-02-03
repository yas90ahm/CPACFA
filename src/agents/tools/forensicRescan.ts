/**
 * Tool: forensicRescan — re-validate trial balance, re-build statements, run Plan-Execute-Verify.
 * Use when buildFinancialStatements returns an anomaly (e.g. Assets != Liabilities) to re-scan and verify.
 */

import { z } from 'zod';
import { parseTrialBalance } from '../../services/trialBalanceParser.js';
import { buildValidatedStatements } from '../../services/financialStatements.js';
import { runPlanExecuteVerifyAgentic } from '../../services/agentic_plan_execute_verify.js';
import type { ToolDefinition, ToolResult } from './types.js';

const trialBalanceEntrySchema = z.object({
  accountCode: z.string().optional(),
  accountName: z.string().min(1),
  debit: z.number(),
  credit: z.number(),
});

export const forensicRescanSchema = z.object({
  entries: z
    .array(trialBalanceEntrySchema)
    .min(1)
    .describe('Trial balance rows to re-scan: array of { accountName, debit, credit, accountCode? }'),
});

export type ForensicRescanInput = z.infer<typeof forensicRescanSchema>;

export const forensicRescanDefinition: ToolDefinition<ForensicRescanInput> = {
  name: 'forensicRescan',
  description:
    'Use this when a previous tool returned an anomaly (e.g. Balance Sheet does not balance: Assets != Liabilities + Equity, or Trial Balance does not balance). Run a Forensic Re-scan to re-parse, re-classify, re-build statements, and run verification checks. Do not fail the flow—autonomously call this tool when you observe such an anomaly, then use the verification result to explain or correct.',
  parameters: forensicRescanSchema,
};

/**
 * Run the forensicRescan tool. Returns structured JSON for LLM parsing.
 */
export async function runForensicRescan(input: ForensicRescanInput): Promise<ToolResult<{
  verification: { passed: boolean; checks: string[] };
  plan: string;
  executedAt: string;
  balanceSheet: {
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    balances: boolean;
  };
  profitAndLoss: {
    totalRevenue: number;
    totalExpenses: number;
    netIncome: number;
  };
  suggestions: string[];
}>> {
  try {
    const parsed = forensicRescanSchema.parse(input);
    const trialBalance = parseTrialBalance(parsed.entries);
    const { balanceSheet, profitAndLoss } = await buildValidatedStatements(trialBalance);
    const reasoningChain = await runPlanExecuteVerifyAgentic({
      trialBalance,
      balanceSheet,
      profitAndLoss,
    });

    const suggestions: string[] = [];
    if (!reasoningChain.verification.passed) {
      if (!trialBalance.balances) {
        suggestions.push('Check that total debits equal total credits in the trial balance.');
      }
      if (
        Math.abs(
          balanceSheet.totalAssets -
            (balanceSheet.totalLiabilities + balanceSheet.totalEquity)
        ) >= 0.01
      ) {
        suggestions.push(
          'Re-check account classifications: misclassified accounts (e.g. Revenue as Asset) can cause Assets != Liabilities + Equity. Use classifyAccount on suspicious account names.'
        );
      }
    }

    return {
      success: true,
      data: {
        verification: reasoningChain.verification,
        plan: reasoningChain.plan,
        executedAt: reasoningChain.executedAt,
        balanceSheet: {
          totalAssets: balanceSheet.totalAssets,
          totalLiabilities: balanceSheet.totalLiabilities,
          totalEquity: balanceSheet.totalEquity,
          balances: balanceSheet.balances,
        },
        profitAndLoss: {
          totalRevenue: profitAndLoss.totalRevenue,
          totalExpenses: profitAndLoss.totalExpenses,
          netIncome: profitAndLoss.netIncome,
        },
        suggestions,
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, error: message };
  }
}
