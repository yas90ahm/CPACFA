/**
 * Tool: computeRatios — compute key financial ratios from Balance Sheet and P&L.
 * Wraps CFA liquidity metrics (Current/Quick) plus Debt-to-Equity, ROE, Net Margin.
 */

import { z } from 'zod';
// QUARANTINED — analysis_agent not in MVP architecture
// import { computeLiquidityMetrics } from '../../services/analysis_agent.js';
import type { ToolDefinition, ToolResult } from './types.js';

export const computeRatiosSchema = z.object({
  totalAssets: z.number().describe('Total assets from balance sheet'),
  totalLiabilities: z.number().describe('Total liabilities from balance sheet'),
  totalEquity: z.number().describe('Total equity from balance sheet'),
  totalRevenue: z.number().min(0).describe('Total revenue from P&L'),
  netIncome: z.number().describe('Net income from P&L'),
  currentAssets: z.number().min(0).optional().describe('Sum of current asset line items (defaults to totalAssets if omitted)'),
  currentLiabilities: z.number().min(0).optional().describe('Sum of current liability line items (defaults to totalLiabilities if omitted)'),
  inventory: z.number().min(0).optional().describe('Inventory amount for Quick Ratio (default 0)'),
  accountsReceivable: z.number().min(0).optional().describe('AR for liquidity metrics (default 0)'),
  accountsPayable: z.number().min(0).optional().describe('AP for liquidity metrics (default 0)'),
});

export type ComputeRatiosInput = z.infer<typeof computeRatiosSchema>;

export const computeRatiosDefinition: ToolDefinition<ComputeRatiosInput> = {
  name: 'computeRatios',
  description:
    'Use this to calculate liquidity and profitability ratios when the user asks about risk, liquidity, leverage, ROE, margins, or key financial ratios. Computes Current Ratio, Quick Ratio, Debt-to-Equity, Return on Equity (ROE), and Net Margin. Use when you have balance sheet and P&L totals (and optionally current assets/liabilities, inventory, AR, AP for more accurate liquidity metrics).',
  parameters: computeRatiosSchema,
};

/**
 * Run the computeRatios tool. Returns structured JSON for LLM parsing.
 */
export function runComputeRatios(input: ComputeRatiosInput): ToolResult<{
  currentRatio: number;
  quickRatio: number;
  debtToEquity: number;
  roe: number;
  netMargin: number;
  cashConversionCycleDays?: number;
  daysSalesOutstanding?: number;
  daysInventoryOutstanding?: number;
  daysPayablesOutstanding?: number;
}> {
  try {
    const parsed = computeRatiosSchema.parse(input);
    const currentAssets = parsed.currentAssets ?? parsed.totalAssets;
    const currentLiabilities = parsed.currentLiabilities ?? parsed.totalLiabilities;
    const inventory = parsed.inventory ?? 0;
    const ar = parsed.accountsReceivable ?? 0;
    const ap = parsed.accountsPayable ?? 0;
    const revenue = parsed.totalRevenue || 1;

    // QUARANTINED — analysis_agent not in MVP architecture
    // const liquidityInputs = {
    //   currentAssets,
    //   inventory,
    //   currentLiabilities,
    //   revenue,
    //   accountsReceivable: ar,
    //   accountsPayable: ap,
    // };
    // const metrics = computeLiquidityMetrics(liquidityInputs);
    // Simplified liquidity metrics calculation
    const currentRatio = currentLiabilities !== 0 ? currentAssets / currentLiabilities : 0;
    const quickRatio = currentLiabilities !== 0 ? (currentAssets - inventory) / currentLiabilities : 0;
    const metrics = {
      currentRatio,
      quickRatio,
      cashConversionCycleDays: undefined,
      daysSalesOutstanding: ar > 0 && revenue > 0 ? (ar / revenue) * 365 : undefined,
      daysInventoryOutstanding: inventory > 0 && revenue > 0 ? (inventory / revenue) * 365 : undefined,
      daysPayablesOutstanding: ap > 0 && revenue > 0 ? (ap / revenue) * 365 : undefined,
    };

    const debtToEquity =
      parsed.totalEquity !== 0 ? parsed.totalLiabilities / parsed.totalEquity : 0;
    const roe =
      parsed.totalEquity !== 0 ? parsed.netIncome / parsed.totalEquity : 0;
    const netMargin = revenue !== 0 ? parsed.netIncome / revenue : 0;

    return {
      success: true,
      data: {
        currentRatio: metrics.currentRatio,
        quickRatio: metrics.quickRatio,
        debtToEquity,
        roe,
        netMargin,
        cashConversionCycleDays: metrics.cashConversionCycleDays,
        daysSalesOutstanding: metrics.daysSalesOutstanding,
        daysInventoryOutstanding: metrics.daysInventoryOutstanding,
        daysPayablesOutstanding: metrics.daysPayablesOutstanding,
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, error: message };
  }
}
