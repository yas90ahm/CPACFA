/**
 * FinOS analysis — Types for audit, liquidity, and tools.
 */

/** Single entry for audit (e.g. GL line or time-series point) */
export interface AuditEntry {
  label: string;
  amount: number;
  accountCode?: string;
  date?: string;
  priorYearAmount?: number;
}

/** Benford's Law: expected proportion for first digit d (1–9) */
export const BENFORD_EXPECTED: Record<number, number> = {
  1: 0.301, 2: 0.176, 3: 0.125, 4: 0.097, 5: 0.079, 6: 0.067, 7: 0.058, 8: 0.051, 9: 0.046,
};

export interface AuditCheckResult {
  passed: boolean;
  flags: AuditFlag[];
  summary: string;
  benford?: BenfordResult;
  yoyVariances?: YoYVariance[];
  roundSumEntries?: RoundSumEntry[];
}

export interface AuditFlag {
  type: 'BENFORD' | 'YOY_VARIANCE' | 'ROUND_SUM';
  severity: 'high' | 'medium' | 'low';
  message: string;
  detail?: string;
}

export interface BenfordResult {
  digitCounts: Record<number, number>;
  observedProportions: Record<number, number>;
  chiSquare?: number;
  deviationScore: number; // 0–1, higher = more deviation from Benford
}

export interface YoYVariance {
  label: string;
  current: number;
  prior: number;
  percentChange: number;
  flagged: boolean;
  thresholdPercent: number;
}

export interface RoundSumEntry {
  label: string;
  amount: number;
  roundUnit: number; // e.g. 1000, 10000
  accountCode?: string;
}

/** DCF inputs */
export interface DCFInputs {
  freeCashFlows: number[]; // FCF_1, FCF_2, ... (explicit forecast)
  terminalGrowthRate: number; // g, perpetual growth (e.g. 0.02)
  wacc: number; // discount rate (e.g. 0.10)
  terminalMultiple?: number; // optional: use EV/EBITDA multiple instead of perpetuity
}

/** DCF output */
export interface DCFResult {
  enterpriseValue: number;
  presentValueExplicit: number;
  terminalValue: number;
  presentValueTerminal: number;
  assumptions: DCFInputs;
}

/** Sensitivity: one variable varied */
export interface SensitivityScenario {
  name: string;
  wacc?: number;
  terminalGrowthRate?: number;
  enterpriseValue: number;
}

export interface SensitivityAnalysisResult {
  baseCase: DCFResult;
  scenarios: SensitivityScenario[];
  grid?: { wacc: number[]; growth: number[]; values: number[][] };
}

/** Liquidity metrics (CFA Level I) */
export interface LiquidityMetrics {
  currentRatio: number;
  quickRatio: number;
  cashConversionCycleDays: number;
  daysInventoryOutstanding: number;
  daysSalesOutstanding: number;
  daysPayablesOutstanding: number;
}

/** Balance sheet inputs for liquidity (all positive magnitudes) */
export interface LiquidityInputs {
  currentAssets: number;
  inventory: number;
  currentLiabilities: number;
  revenue: number; // for DSO
  costOfGoodsSold?: number; // for DIO if available
  accountsReceivable: number;
  accountsPayable: number;
  /** Optional: average inventory for CCC; falls back to period-end inventory */
  averageInventory?: number;
}

export interface LiquidityAssessment {
  metrics: LiquidityMetrics;
  summary: string;
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  bulletPoints: string[];
}

