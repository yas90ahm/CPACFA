/**
 * M&A readiness: quality of earnings (adj EBITDA, normalizations), working capital adjustments.
 * Financing: covenant monitoring (debt/EBITDA, interest coverage).
 */

export interface QualityOfEarningsInput {
  reportedNetIncome: number;
  interest: number;
  taxes: number;
  depreciation: number;
  amortization: number;
  /** One-time or non-recurring add-backs (e.g. restructuring) */
  addBacks?: number;
  /** Owner compensation adjustment (normalize to market) */
  ownerCompAdjustment?: number;
}

export interface QualityOfEarningsResult {
  ebitda: number;
  adjustedEbitda: number;
  addBacks: number;
  normalizations: string[];
}

/**
 * Compute EBITDA and adjusted EBITDA for QoE.
 */
export function buildQualityOfEarnings(input: QualityOfEarningsInput): QualityOfEarningsResult {
  const { reportedNetIncome, interest, taxes, depreciation, amortization, addBacks = 0, ownerCompAdjustment = 0 } = input;
  const ebitda = reportedNetIncome + interest + taxes + depreciation + amortization;
  const normalizations: string[] = [];
  let adj = ebitda + addBacks;
  if (addBacks !== 0) normalizations.push(`Add-backs: ${addBacks}`);
  if (ownerCompAdjustment !== 0) {
    adj += ownerCompAdjustment;
    normalizations.push(`Owner comp adjustment: ${ownerCompAdjustment}`);
  }
  return {
    ebitda,
    adjustedEbitda: adj,
    addBacks,
    normalizations,
  };
}

export interface WorkingCapitalAdjustmentInput {
  currentAssets: number;
  currentLiabilities: number;
  /** Target WC as % of revenue or absolute */
  targetWCDays?: number; // e.g. 45 days
  revenue?: number; // for days-based target
}

export interface WorkingCapitalAdjustmentResult {
  currentWC: number;
  targetWC?: number;
  adjustment?: number; // positive = increase WC (e.g. reduce AR), negative = release
  note: string;
}

/**
 * Working capital adjustment for M&A (current vs target).
 */
export function buildWorkingCapitalAdjustment(
  input: WorkingCapitalAdjustmentInput
): WorkingCapitalAdjustmentResult {
  const wc = input.currentAssets - input.currentLiabilities;
  if (input.targetWCDays == null || input.revenue == null || input.revenue <= 0) {
    return {
      currentWC: wc,
      note: 'Target WC not specified; provide targetWCDays and revenue for adjustment.',
    };
  }
  const targetWC = (input.revenue / 365) * input.targetWCDays;
  const adjustment = targetWC - wc;
  return {
    currentWC: wc,
    targetWC,
    adjustment,
    note: `Current WC ${wc.toLocaleString()}; target ${input.targetWCDays} days → ${targetWC.toLocaleString()}; adjustment ${adjustment >= 0 ? '+' : ''}${adjustment.toLocaleString()}.`,
  };
}

export interface CovenantInput {
  /** Debt (interest-bearing) */
  debt: number;
  /** EBITDA (trailing or projected) */
  ebitda: number;
  /** Interest expense */
  interestExpense: number;
}

export interface CovenantResult {
  debtToEbitda: number;
  interestCoverage: number; // EBITDA / interest
  debtToEbitdaBreach?: boolean; // e.g. > 4x
  interestCoverageBreach?: boolean; // e.g. < 2x
  thresholds?: { maxDebtToEbitda?: number; minInterestCoverage?: number };
  /** Headroom: how close to limit (positive = room, negative = over) */
  debtToEbitdaHeadroom?: number; // maxDebtToEbitda - debtToEbitda
  interestCoverageHeadroom?: number; // interestCoverage - minInterestCoverage
  /** Headroom as % of limit (e.g. 0.2 = 20% room left) */
  debtToEbitdaHeadroomPercent?: number;
  interestCoverageHeadroomPercent?: number;
}

/**
 * Covenant monitoring: debt/EBITDA and interest coverage, with headroom.
 */
export function monitorCovenants(
  input: CovenantInput,
  thresholds: { maxDebtToEbitda?: number; minInterestCoverage?: number } = {}
): CovenantResult {
  const { debt, ebitda, interestExpense } = input;
  const maxD2E = thresholds.maxDebtToEbitda ?? 4;
  const minIC = thresholds.minInterestCoverage ?? 2;
  const debtToEbitda = ebitda > 0 ? debt / ebitda : 0;
  const interestCoverage = interestExpense > 0 ? ebitda / interestExpense : 0;
  const debtToEbitdaHeadroom = maxD2E - debtToEbitda;
  const interestCoverageHeadroom = interestCoverage - minIC;
  return {
    debtToEbitda,
    interestCoverage,
    debtToEbitdaBreach: debtToEbitda > maxD2E,
    interestCoverageBreach: interestCoverage < minIC && interestExpense > 0,
    thresholds: { maxDebtToEbitda: maxD2E, minInterestCoverage: minIC },
    debtToEbitdaHeadroom,
    interestCoverageHeadroom,
    debtToEbitdaHeadroomPercent: maxD2E > 0 ? (debtToEbitdaHeadroom / maxD2E) * 100 : undefined,
    interestCoverageHeadroomPercent: minIC > 0 ? (interestCoverageHeadroom / minIC) * 100 : undefined,
  };
}
