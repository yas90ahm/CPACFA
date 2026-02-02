/**
 * Investment Analysis Agent — Types: DuPont, Benchmarking, Monte Carlo, Skepticism.
 */

/** DuPont Analysis: ROE = Net Margin × Asset Turnover × Equity Multiplier */
export interface DuPontAnalysis {
  roe: number;
  netProfitMargin: number;   // Net Income / Revenue
  assetTurnover: number;    // Revenue / Total Assets
  equityMultiplier: number; // Total Assets / Equity
  revenue: number;
  netIncome: number;
  totalAssets: number;
  shareholdersEquity: number;
}

/** Competitor / relative valuation (P/E, EV/EBITDA) */
export interface RelativeValuation {
  ticker: string;
  companyName?: string;
  peRatio?: number;
  evEbitda?: number;
  source?: string;
  asOfDate?: string;
}

/** Monte Carlo cash flow / liquidity forecast */
export interface MonteCarloLiquidityResult {
  /** Simulations run */
  numSimulations: number;
  /** Next year liquidity (e.g. cash or quick assets) — point estimate */
  pointEstimate: number;
  /** Confidence interval: e.g. { p5: 1000, p50: 1500, p95: 2000 } */
  confidenceInterval: { p5: number; p50: number; p95: number };
  /** Optional: full distribution percentiles */
  percentiles?: Record<number, number>;
}

/** Skepticism Layer: account growing faster than revenue = potential red flag */
export interface SkepticismRedFlag {
  accountCode?: string;
  accountName: string;
  accountGrowthPercent: number;
  revenueGrowthPercent: number;
  message: string;
  severity: 'high' | 'medium';
}

export interface SkepticismResult {
  passed: boolean;
  redFlags: SkepticismRedFlag[];
  summary: string;
}
