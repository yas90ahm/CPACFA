/**
 * Tool: reconcileCPAwithCFA — compare CPA (Balance Sheet / P&L) and CFA (ratios) outputs and return any conflict.
 * Call after both buildFinancialStatements and computeRatios; include the returned conflict in your final response if present.
 */

import type { BalanceSheet, ProfitAndLoss } from '../../types/financial.js';
import type { ConflictVariance } from '../../types/orchestrator.js';
import { resolveConflict, formatConflictForSupervisor } from '../../services/lead_partner_orchestrator.js';
import { z } from 'zod';
import type { ToolDefinition, ToolResult } from './types.js';

/** Minimal shape the agent can pass from buildFinancialStatements + computeRatios results. */
export const reconcileCPAwithCFASchema = z.object({
  balanceSheet: z
    .object({
      totalAssets: z.number(),
      totalLiabilities: z.number(),
      totalEquity: z.number(),
    })
    .optional(),
  profitAndLoss: z
    .object({
      totalRevenue: z.number(),
      netIncome: z.number(),
    })
    .optional(),
  ratios: z
    .object({
      currentRatio: z.number(),
      quickRatio: z.number(),
      roe: z.number(),
      debtToEquity: z.number().optional(),
      netMargin: z.number().optional(),
    })
    .optional(),
});

export type ReconcileCPAwithCFAInput = z.infer<typeof reconcileCPAwithCFASchema>;

export const reconcileCPAwithCFADefinition: ToolDefinition<ReconcileCPAwithCFAInput> = {
  name: 'reconcileCPAwithCFA',
  description:
    'Compare CPA (Balance Sheet / P&L) and CFA (ratios) outputs for conflicts (e.g. ROE sign vs positive net income, book vs valuation). Call after you have called both buildFinancialStatements and computeRatios; pass those results. If a conflict is returned, you MUST include it in your final response.',
  parameters: reconcileCPAwithCFASchema,
};

function toMinimalBalanceSheet(bs: ReconcileCPAwithCFAInput['balanceSheet']): BalanceSheet | undefined {
  if (!bs || bs.totalEquity === undefined) return undefined;
  return {
    assets: [],
    liabilities: [],
    equity: [],
    totalAssets: bs.totalAssets ?? 0,
    totalLiabilities: bs.totalLiabilities ?? 0,
    totalEquity: bs.totalEquity,
    balances: true,
    codificationRef: { framework: 'FASB', citation: 'ASC 210' },
  };
}

function toMinimalProfitAndLoss(pl: ReconcileCPAwithCFAInput['profitAndLoss']): ProfitAndLoss | undefined {
  if (!pl || pl.netIncome === undefined) return undefined;
  return {
    revenue: [],
    expenses: [],
    totalRevenue: pl.totalRevenue ?? 0,
    totalExpenses: 0,
    netIncome: pl.netIncome,
    codificationRef: { framework: 'FASB', citation: 'ASC 220' },
  };
}

/** Flat numeric input from Supervisor (same field names as nested). */
interface FlatReconcileInput {
  totalAssets?: number;
  totalLiabilities?: number;
  totalEquity?: number;
  totalRevenue?: number;
  netIncome?: number;
  currentRatio?: number;
  quickRatio?: number;
  roe?: number;
}

/**
 * Run reconcileCPAwithCFA. Returns conflict text or "No conflict".
 * Accepts nested (balanceSheet, profitAndLoss, ratios) or flat (totalAssets, netIncome, roe, etc.) from Supervisor.
 */
export function runReconcileCPAwithCFA(input: ReconcileCPAwithCFAInput): ToolResult<{ conflict: string | null }> {
  try {
    const parsed = reconcileCPAwithCFASchema.parse(input ?? {}) as ReconcileCPAwithCFAInput & FlatReconcileInput;
    const balanceSheet =
      toMinimalBalanceSheet(parsed.balanceSheet) ??
      (parsed.totalEquity != null
        ? toMinimalBalanceSheet({
            totalAssets: parsed.totalAssets ?? 0,
            totalLiabilities: parsed.totalLiabilities ?? 0,
            totalEquity: parsed.totalEquity,
          })
        : undefined);
    const profitAndLoss =
      toMinimalProfitAndLoss(parsed.profitAndLoss) ??
      (parsed.netIncome != null
        ? toMinimalProfitAndLoss({
            totalRevenue: parsed.totalRevenue ?? 0,
            netIncome: parsed.netIncome,
          })
        : undefined);
    const cfaRatios = parsed.ratios
      ? {
          currentRatio: parsed.ratios.currentRatio,
          quickRatio: parsed.ratios.quickRatio,
          roe: parsed.ratios.roe,
        }
      : parsed.roe != null
        ? {
            currentRatio: parsed.currentRatio ?? 0,
            quickRatio: parsed.quickRatio ?? 0,
            roe: parsed.roe,
          }
        : undefined;
    const conflict: ConflictVariance | undefined = resolveConflict(
      balanceSheet,
      profitAndLoss,
      cfaRatios,
      undefined
    );
    if (conflict) {
      return { success: true, data: { conflict: formatConflictForSupervisor(conflict) } };
    }
    return { success: true, data: { conflict: null } };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, error: message };
  }
}
