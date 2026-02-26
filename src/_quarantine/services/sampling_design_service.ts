/**
 * Sampling design: suggest sample size from population size and optional risk/confidence/materiality.
 * Standard audit sampling logic (tiered lookup); client uses suggested size when calling POST /api/audit/sampling.
 */

export interface SamplingDesignOptions {
  /** Risk of overreliance (e.g. 0.05 = 5%). Higher risk → smaller sample. */
  risk?: number;
  /** Desired confidence level (e.g. 0.95 = 95%). Higher confidence → larger sample. */
  confidenceLevel?: number;
  /** Materiality threshold (for variables sampling; can influence method). */
  materialityThreshold?: number;
  /** Prefer risk-based selection when population has monetary amounts. */
  preferRiskBased?: boolean;
}

export interface SamplingDesignResult {
  suggestedSampleSize: number;
  method: 'random' | 'risk_based' | 'hilo';
}

/**
 * Tiered sample sizes by population (AICPA-style attribute sampling approximate).
 * For 5% tolerable deviation, 5% risk: ~60; for 10% tolerable ~40; higher population → modest increase.
 */
const SAMPLE_SIZE_TIERS: [number, number][] = [
  [50, 20],
  [100, 25],
  [500, 40],
  [1000, 60],
  [2500, 80],
  [5000, 100],
  [10000, 120],
  [Infinity, 150],
];

/**
 * Suggest sample size for a given population size. Options may adjust size and method.
 */
export function suggestSampleSize(
  populationSize: number,
  options: SamplingDesignOptions = {}
): SamplingDesignResult {
  const n = Math.max(0, Math.floor(populationSize));
  if (n === 0) {
    return { suggestedSampleSize: 0, method: 'random' };
  }

  let suggested = 25;
  for (const [cap, size] of SAMPLE_SIZE_TIERS) {
    if (n <= cap) {
      suggested = size;
      break;
    }
  }
  suggested = Math.min(suggested, n);

  if (options.risk != null && options.risk > 0.05) {
    suggested = Math.max(20, Math.floor(suggested * 0.9));
  }
  if (options.confidenceLevel != null && options.confidenceLevel >= 0.95) {
    suggested = Math.min(n, Math.floor(suggested * 1.1) + 5);
  }
  suggested = Math.min(suggested, n);
  suggested = Math.max(1, suggested);

  let method: 'random' | 'risk_based' | 'hilo' = 'random';
  if (options.preferRiskBased || (options.materialityThreshold != null && options.materialityThreshold > 0)) {
    method = 'risk_based';
  }

  return { suggestedSampleSize: suggested, method };
}
