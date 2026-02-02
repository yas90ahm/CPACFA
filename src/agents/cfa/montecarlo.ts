/**
 * Monte Carlo simulation for cash flow / liquidity forecasting.
 * Outputs a Confidence Interval for next year's liquidity.
 */

import type { MonteCarloLiquidityResult } from './types.js';

export interface MonteCarloInputs {
  /** Current year liquidity (e.g. cash or quick assets) */
  currentLiquidity: number;
  /** Historical or assumed growth rate (e.g. 0.05 = 5%) */
  expectedGrowthRate: number;
  /** Volatility of growth (std dev, e.g. 0.10 = 10%) */
  volatility: number;
  /** Number of simulations */
  numSimulations?: number;
}

/**
 * Run Monte Carlo simulation for next year's liquidity.
 * Returns point estimate and confidence interval (e.g. 5th, 50th, 95th percentile).
 */
export function monteCarloLiquidityForecast(
  inputs: MonteCarloInputs
): MonteCarloLiquidityResult {
  const {
    currentLiquidity,
    expectedGrowthRate,
    volatility,
    numSimulations = 10_000,
  } = inputs;

  const outcomes: number[] = [];

  for (let i = 0; i < numSimulations; i++) {
    const z = boxMullerRandom();
    const growth = expectedGrowthRate + volatility * z;
    const nextYearLiquidity = currentLiquidity * (1 + growth);
    outcomes.push(Math.max(0, nextYearLiquidity));
  }

  outcomes.sort((a, b) => a - b);

  const p5 = percentile(outcomes, 5);
  const p50 = percentile(outcomes, 50);
  const p95 = percentile(outcomes, 95);

  const pointEstimate = currentLiquidity * (1 + expectedGrowthRate);

  return {
    numSimulations,
    pointEstimate,
    confidenceInterval: { p5, p50, p95 },
    percentiles: {
      5: p5,
      10: percentile(outcomes, 10),
      25: percentile(outcomes, 25),
      50: p50,
      75: percentile(outcomes, 75),
      90: percentile(outcomes, 90),
      95: p95,
    },
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (index - lower) * (sorted[upper] - sorted[lower]);
}

/** Box-Muller transform for normal random from uniform */
function boxMullerRandom(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  if (u1 <= 0) return boxMullerRandom();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
