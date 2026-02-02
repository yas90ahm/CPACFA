/**
 * Investment Analysis Agent: DuPont, Competitor Benchmarking, Monte Carlo, Skepticism Layer.
 */

import type { DuPontAnalysis, RelativeValuation, MonteCarloLiquidityResult, SkepticismResult } from './types.js';
import { dupontAnalysis } from './dupont.js';
import { benchmarkCompetitor } from './benchmark.js';
import { monteCarloLiquidityForecast } from './montecarlo.js';
import { skepticismLayer } from './skepticism.js';
import type { DuPontInputs } from './dupont.js';
import type { MonteCarloInputs } from './montecarlo.js';
import type { AccountWithGrowth } from './skepticism.js';
import type { WebSearchFn } from './benchmark.js';

export type { DuPontAnalysis, RelativeValuation, MonteCarloLiquidityResult, SkepticismResult };
export { dupontAnalysis, benchmarkCompetitor, monteCarloLiquidityForecast, skepticismLayer };
export type { DuPontInputs, MonteCarloInputs, AccountWithGrowth, WebSearchFn };

export interface InvestmentAnalysisInput {
  /** For DuPont */
  netIncome?: number;
  revenue?: number;
  totalAssets?: number;
  shareholdersEquity?: number;
  /** For Monte Carlo */
  currentLiquidity?: number;
  expectedGrowthRate?: number;
  volatility?: number;
  /** For Skepticism: accounts with current/prior amounts; revenue growth % */
  accounts?: AccountWithGrowth[];
  revenueGrowthPercent?: number;
  /** Competitor ticker for benchmarking (triggers Web Search) */
  competitorTicker?: string;
  /** Web Search function (e.g. from MCP or fetch) */
  webSearch?: WebSearchFn;
}

export interface InvestmentAnalysisOutput {
  dupont?: DuPontAnalysis;
  competitorValuation?: RelativeValuation;
  monteCarloLiquidity?: MonteCarloLiquidityResult;
  skepticism?: SkepticismResult;
  summary: string;
}

/**
 * Run the Investment Analysis Agent: DuPont, Benchmark (if ticker), Monte Carlo, Skepticism.
 */
export async function runInvestmentAnalysis(
  input: InvestmentAnalysisInput
): Promise<InvestmentAnalysisOutput> {
  const parts: string[] = [];
  let dupont: DuPontAnalysis | undefined;
  let competitorValuation: RelativeValuation | undefined;
  let monteCarloLiquidity: MonteCarloLiquidityResult | undefined;
  let skepticism: SkepticismResult | undefined;

  if (
    input.netIncome != null &&
    input.revenue != null &&
    input.totalAssets != null &&
    input.shareholdersEquity != null
  ) {
    dupont = dupontAnalysis({
      netIncome: input.netIncome,
      revenue: input.revenue,
      totalAssets: input.totalAssets,
      shareholdersEquity: input.shareholdersEquity,
    });
    parts.push(
      `DuPont ROE: ${(dupont.roe * 100).toFixed(1)}% = Net Margin ${(dupont.netProfitMargin * 100).toFixed(1)}% × Asset Turnover ${dupont.assetTurnover.toFixed(2)} × Equity Multiplier ${dupont.equityMultiplier.toFixed(2)}.`
    );
  }

  if (input.competitorTicker && input.webSearch) {
    try {
      competitorValuation = await benchmarkCompetitor(
        input.competitorTicker,
        input.webSearch
      );
      if (competitorValuation.peRatio != null) {
        parts.push(`Competitor ${competitorValuation.ticker} P/E: ${competitorValuation.peRatio.toFixed(1)}x.`);
      }
      if (competitorValuation.evEbitda != null) {
        parts.push(`EV/EBITDA: ${competitorValuation.evEbitda.toFixed(1)}x.`);
      }
      if (parts.length === 0 && competitorValuation) {
        parts.push(`Competitor ${competitorValuation.ticker} benchmark requested; P/E and EV/EBITDA from 10-K search.`);
      }
    } catch (e) {
      parts.push(`Competitor benchmark (${input.competitorTicker}) failed: ${e instanceof Error ? e.message : 'Unknown error'}.`);
    }
  }

  if (
    input.currentLiquidity != null &&
    input.expectedGrowthRate != null &&
    input.volatility != null
  ) {
    monteCarloLiquidity = monteCarloLiquidityForecast({
      currentLiquidity: input.currentLiquidity,
      expectedGrowthRate: input.expectedGrowthRate,
      volatility: input.volatility,
    });
    const ci = monteCarloLiquidity.confidenceInterval;
    parts.push(
      `Monte Carlo liquidity (next year): point estimate ${monteCarloLiquidity.pointEstimate.toLocaleString()}; 90% CI [${ci.p5.toLocaleString()}, ${ci.p95.toLocaleString()}]; median ${ci.p50.toLocaleString()}.`
    );
  }

  if (input.accounts && input.accounts.length > 0 && input.revenueGrowthPercent != null) {
    skepticism = skepticismLayer(
      input.accounts,
      input.revenueGrowthPercent
    );
    if (!skepticism.passed) {
      parts.push(`Skepticism Layer: ${skepticism.summary} ${skepticism.redFlags.map((f) => f.accountName).join(', ')}.`);
    } else {
      parts.push('Skepticism Layer: No accounts grew faster than revenue; no red flags.');
    }
  }

  const summary = parts.length > 0 ? parts.join(' ') : 'No analysis inputs provided.';

  return {
    dupont,
    competitorValuation,
    monteCarloLiquidity,
    skepticism,
    summary,
  };
}
