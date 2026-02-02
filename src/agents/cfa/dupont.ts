/**
 * DuPont Analysis: ROE = Net Profit Margin × Asset Turnover × Equity Multiplier.
 */

import type { DuPontAnalysis } from './types.js';

export interface DuPontInputs {
  netIncome: number;
  revenue: number;
  totalAssets: number;
  shareholdersEquity: number;
}

/**
 * Break down ROE using the 3-component DuPont model:
 * ROE = (Net Income / Revenue) × (Revenue / Total Assets) × (Total Assets / Equity)
 *      = Net Profit Margin × Asset Turnover × Equity Multiplier
 */
export function dupontAnalysis(inputs: DuPontInputs): DuPontAnalysis {
  const { netIncome, revenue, totalAssets, shareholdersEquity } = inputs;

  const netProfitMargin = revenue !== 0 ? netIncome / revenue : 0;
  const assetTurnover = totalAssets !== 0 ? revenue / totalAssets : 0;
  const equityMultiplier = shareholdersEquity !== 0 ? totalAssets / shareholdersEquity : 0;

  const roe = netProfitMargin * assetTurnover * equityMultiplier;
  const roeDirect = shareholdersEquity !== 0 ? netIncome / shareholdersEquity : 0;

  return {
    roe: roeDirect,
    netProfitMargin,
    assetTurnover,
    equityMultiplier,
    revenue,
    netIncome,
    totalAssets,
    shareholdersEquity,
  };
}
