/**
 * Tool: buildFinancialStatements — build Balance Sheet and P&L from trial balance entries.
 * Accepts optional `standard` (ASPE | IFRS): ASPE uses simplified depreciation; IFRS triggers Lease Liability calculation when lease data provided.
 */

import { z } from 'zod';
import type { Pool } from 'pg';
import { parseTrialBalance } from '../../services/trialBalanceParser.js';
import { buildFinancialStatements as buildFinancialStatementsService } from '../../services/financialStatements.js';
import { generateStatements } from '../../services/statementGenerator.js';
import { listContracts } from '../../db/repositories/revenue_recognition_repository.js';
import type { IntegrityContractFact } from '../../types/integrity.js';
import { runPlanExecuteVerify } from '../../services/planExecuteVerify.js';
import type { ToolDefinition, ToolResult } from './types.js';

const trialBalanceEntrySchema = z.object({
  accountCode: z.string().optional(),
  accountName: z.string().min(1),
  debit: z.number(),
  credit: z.number(),
});

const leaseInputSchema = z.object({
  leasePayments: z.array(z.number()).min(1),
  discountRate: z.number().min(0).max(1),
  paymentTiming: z.enum(['beginning', 'end']).optional(),
});

export const buildFinancialStatementsSchema = z.object({
  entries: z
    .array(trialBalanceEntrySchema)
    .min(1)
    .describe('Trial balance rows: array of { accountName, debit, credit, accountCode? }'),
  prior_entries: z
    .array(trialBalanceEntrySchema)
    .optional()
    .describe('Optional prior-period trial balance rows for cash flow/equity roll-forward.'),
  standard: z
    .enum(['ASPE', 'IFRS', 'FRS102', 'US_GAAP'])
    .optional()
    .describe('Accounting standard: ASPE, IFRS, FRS102, or US GAAP.'),
  lease: leaseInputSchema
    .optional()
    .describe('Optional lease data for IFRS 16: leasePayments, discountRate, paymentTiming. Used when standard is IFRS.'),
  fullSet: z
    .boolean()
    .optional()
    .default(false)
    .describe('When true, include Cash Flow, Equity Changes, and Notes/Policies in the response.'),
});

export type BuildFinancialStatementsInput = z.infer<typeof buildFinancialStatementsSchema>;

export const buildFinancialStatementsDefinition: ToolDefinition<BuildFinancialStatementsInput> = {
  name: 'buildFinancialStatements',
  description:
    'Use this when you have trial balance data and need to produce a standard Balance Sheet and Profit & Loss (P&L). Use it when the user asks for financial statements, balance sheet, P&L, or income statement from raw trial balance entries. Returns Balance Sheet (assets, liabilities, equity), P&L (revenue, expenses, net income), and classified entries. Ensures Assets = Liabilities + Equity.',
  parameters: buildFinancialStatementsSchema as import('zod').z.ZodType<BuildFinancialStatementsInput>,
};

/** Serialize statement line for JSON (no circular refs) */
function serializeLine(line: { accountCode?: string; label: string; amount: number }) {
  return { accountCode: line.accountCode, label: line.label, amount: line.amount };
}

/** Optional request context: when present, contracts are loaded and integrity gate runs. */
export interface BuildFinancialStatementsContext {
  tenantId: string;
  pool: Pool;
}

/**
 * Run the buildFinancialStatements tool. Returns structured JSON for LLM parsing.
 * When context (tenantId + pool) is provided, loads contracts and runs the integrity gate before building statements.
 */
export async function runBuildFinancialStatements(
  input: BuildFinancialStatementsInput,
  context?: BuildFinancialStatementsContext
): Promise<ToolResult<{
  balanceSheet: {
    assets: ReturnType<typeof serializeLine>[];
    liabilities: ReturnType<typeof serializeLine>[];
    equity: ReturnType<typeof serializeLine>[];
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    balances: boolean;
  };
  profitAndLoss: {
    revenue: ReturnType<typeof serializeLine>[];
    expenses: ReturnType<typeof serializeLine>[];
    totalRevenue: number;
    totalExpenses: number;
    netIncome: number;
  };
  classifiedEntriesCount: number;
}>> {
  try {
    const parsed = buildFinancialStatementsSchema.parse(input);
    const trialBalance = parseTrialBalance(parsed.entries);
    if (!trialBalance.balances && trialBalance.errors.length > 0) {
      return {
        success: false,
        error: `Trial balance does not balance: ${trialBalance.errors.join('; ')}`,
      };
    }

    const standard = parsed.standard;
    const lease = parsed.lease;
    const fullSet = parsed.fullSet ?? false;
    const priorTrialBalance = parsed.prior_entries ? parseTrialBalance(parsed.prior_entries) : undefined;

    let stmtOpts: { lease?: typeof lease; fullSet: boolean; priorTrialBalance?: typeof priorTrialBalance; contracts?: IntegrityContractFact[] } = {
      lease,
      fullSet,
      priorTrialBalance,
    };
    if (standard && context) {
      const rows = await listContracts(context.pool, context.tenantId);
      stmtOpts = { ...stmtOpts, contracts: rows.map((r) => ({ id: r.id, totalContractValue: r.totalContractValue, periodRecognizedRevenue: undefined })) };
    }
    const result = standard
      ? await generateStatements(trialBalance, standard, stmtOpts)
      : await buildFinancialStatementsService(trialBalance);
    const balanceSheet = result.balanceSheet;
    const profitAndLoss = result.profitAndLoss;
    const classifiedEntries = result.classifiedEntries;
    const standardMetadata = 'standardMetadata' in result ? result.standardMetadata : undefined;

    const pev = runPlanExecuteVerify({ trialBalance, balanceSheet, profitAndLoss });
    if (!pev.verification.passed) {
      return {
        success: false,
        error: `Verification failed: ${pev.verification.checks.join('; ')}. Unverified statements are not returned.`,
      };
    }

    return {
      success: true,
      data: {
        balanceSheet: {
          assets: balanceSheet.assets.map(serializeLine),
          liabilities: balanceSheet.liabilities.map(serializeLine),
          equity: balanceSheet.equity.map(serializeLine),
          totalAssets: balanceSheet.totalAssets,
          totalLiabilities: balanceSheet.totalLiabilities,
          totalEquity: balanceSheet.totalEquity,
          balances: balanceSheet.balances,
        },
        profitAndLoss: {
          revenue: profitAndLoss.revenue.map(serializeLine),
          expenses: profitAndLoss.expenses.map(serializeLine),
          totalRevenue: profitAndLoss.totalRevenue,
          totalExpenses: profitAndLoss.totalExpenses,
          netIncome: profitAndLoss.netIncome,
        },
        classifiedEntriesCount: classifiedEntries.length,
        ...(standard ? { standard } : {}),
        ...(standardMetadata ? { standardMetadata } : {}),
        ...('cashFlow' in result && result.cashFlow ? { cashFlow: result.cashFlow } : {}),
        ...('equityChanges' in result && result.equityChanges ? { equityChanges: result.equityChanges } : {}),
        ...('notesAndPolicies' in result && result.notesAndPolicies ? { notesAndPolicies: result.notesAndPolicies } : {}),
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, error: message };
  }
}
