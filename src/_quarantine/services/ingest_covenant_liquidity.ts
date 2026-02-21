/**
 * Derive covenant and liquidity inputs from ingest output (BS/P&L) for runProfessionalReview.
 * Wires CovenantMonitor + LiquidityMetrics into the ingest pipeline so runGoingConcern
 * receives covenantResult and liquidityMetrics (current ratio, runway, burn rate when derivable).
 */

import type { BalanceSheet, ProfitAndLoss } from '../types/financial.js';
import type {
  ProfessionalReviewCovenantResult,
  ProfessionalReviewLiquidityMetrics,
  ProfessionalReviewPriorLiquidity,
} from '../types/professional_review.js';
// QUARANTINED — enterprise_m_and_a_financing_service and analysis_agent not in MVP architecture
// import { monitorCovenants } from './enterprise_m_and_a_financing_service.js';
// import { computeLiquidityMetrics } from './analysis_agent.js';
import type { LiquidityInputs } from '../types/analysis.js';

export interface IngestCovenantLiquidityInput {
  balanceSheet: BalanceSheet;
  profitAndLoss: ProfitAndLoss;
  /** Optional: for runway/burn when net income is negative */
  cashFlow?: { netChangeInCash?: number; endingCash?: number };
}

export interface IngestCovenantLiquidityResult {
  covenantResult: ProfessionalReviewCovenantResult;
  liquidityMetrics: ProfessionalReviewLiquidityMetrics;
  priorLiquidityMetrics?: ProfessionalReviewPriorLiquidity;
}

function sumLineAmount(lines: { label: string; amount: number }[], pattern: RegExp): number {
  return lines
    .filter((l) => pattern.test(l.label ?? ''))
    .reduce((s, l) => s + l.amount, 0);
}

function findLineAmount(lines: { label: string; amount: number }[], pattern: RegExp): number {
  const line = lines.find((l) => pattern.test(l.label ?? ''));
  return line?.amount ?? 0;
}

/**
 * Derive debt (interest-bearing): sum liability lines matching debt/loan/borrowing, else totalLiabilities.
 */
function deriveDebt(balanceSheet: BalanceSheet): number {
  const debtLike = sumLineAmount(
    balanceSheet.liabilities,
    /debt|loan|borrowing|notes payable|long-term debt|current portion of debt/i
  );
  return debtLike > 0 ? debtLike : balanceSheet.totalLiabilities;
}

/**
 * Derive interest expense from P&L expense lines.
 */
function deriveInterestExpense(profitAndLoss: ProfitAndLoss): number {
  return sumLineAmount(profitAndLoss.expenses, /interest/i);
}

/**
 * Derive EBITDA: netIncome + interest + taxes + depreciation + amortization (from expense lines).
 */
function deriveEbitda(profitAndLoss: ProfitAndLoss): number {
  const netIncome = profitAndLoss.netIncome ?? 0;
  const interest = deriveInterestExpense(profitAndLoss);
  const taxExpense = sumLineAmount(profitAndLoss.expenses, /tax|income tax/i);
  const depreciation = sumLineAmount(profitAndLoss.expenses, /depreciation/i);
  const amortization = sumLineAmount(profitAndLoss.expenses, /amortization/i);
  return netIncome + interest + taxExpense + depreciation + amortization;
}

/**
 * Patterns for current assets/liabilities when BS has current/non-current breakdown (CPA/CFA current ratio).
 * Matches line labels containing "current assets" / "current asset" (or "total current assets"), and "current liabilit".
 * If no line matches, buildLiquidityInputs falls back to total assets/liabilities.
 */
const CURRENT_ASSETS_PATTERN = /\bcurrent\s*assets?\b|total\s*current\s*assets?/i;
const CURRENT_LIABILITIES_PATTERN = /\bcurrent\s*liabilit/i;

/**
 * Build LiquidityInputs from BS/P&L. Prefers line items labeled "current assets" / "current liabilities"
 * when present; otherwise falls back to total assets/liabilities. Same pattern as result_generator step2CFA.
 */
function buildLiquidityInputs(balanceSheet: BalanceSheet, profitAndLoss: ProfitAndLoss): LiquidityInputs {
  const currentAssetsFromLines = sumLineAmount(balanceSheet.assets, CURRENT_ASSETS_PATTERN);
  const currentLiabilitiesFromLines = sumLineAmount(balanceSheet.liabilities, CURRENT_LIABILITIES_PATTERN);
  const totalAssets = balanceSheet.assets.reduce((s, l) => s + l.amount, 0);
  const totalLiabilities = balanceSheet.liabilities.reduce((s, l) => s + l.amount, 0);
  const currentAssets =
    currentAssetsFromLines > 0 ? currentAssetsFromLines : totalAssets;
  const currentLiabilities =
    currentLiabilitiesFromLines > 0 ? currentLiabilitiesFromLines : totalLiabilities;
  const inventory = findLineAmount(balanceSheet.assets, /inventory/i);
  const ar = findLineAmount(balanceSheet.assets, /receivable/i);
  const ap = findLineAmount(balanceSheet.liabilities, /payable/i);
  const revenue = profitAndLoss.totalRevenue || 1;
  return {
    currentAssets,
    inventory,
    currentLiabilities,
    revenue,
    accountsReceivable: ar,
    accountsPayable: ap,
  };
}

/**
 * Derive covenant result and liquidity metrics from ingest output.
 * Called by trialBalance ingest and statements paths before runProfessionalReview.
 */
export function deriveCovenantAndLiquidityFromIngest(
  input: IngestCovenantLiquidityInput
): IngestCovenantLiquidityResult {
  const { balanceSheet, profitAndLoss, cashFlow } = input;

  const debt = deriveDebt(balanceSheet);
  const ebitda = deriveEbitda(profitAndLoss);
  const interestExpense = deriveInterestExpense(profitAndLoss);

  // QUARANTINED — enterprise_m_and_a_financing_service and analysis_agent not in MVP architecture
  // const covenantResultRaw = monitorCovenants(
  //   { debt, ebitda, interestExpense },
  //   { maxDebtToEbitda: 4, minInterestCoverage: 2 }
  // );
  const debtToEbitda = ebitda > 0 ? debt / ebitda : 0;
  const interestCoverage = interestExpense > 0 ? ebitda / interestExpense : 0;
  const covenantResult: ProfessionalReviewCovenantResult = {
    debtToEbitdaBreach: debtToEbitda > 4,
    interestCoverageBreach: interestCoverage < 2,
  };

  const liquidityInputs = buildLiquidityInputs(balanceSheet, profitAndLoss);
  // const metrics = computeLiquidityMetrics(liquidityInputs);
  // Simplified liquidity metrics
  const currentAssets = liquidityInputs.currentAssets;
  const currentLiabilities = liquidityInputs.currentLiabilities;
  const metrics = {
    currentRatio: currentLiabilities !== 0 ? currentAssets / currentLiabilities : 0,
  };

  const netIncome = profitAndLoss.netIncome ?? 0;
  const cash =
    findLineAmount(balanceSheet.assets, /cash/i) ||
    (cashFlow?.endingCash ?? 0);
  let runwayMonths: number | undefined;
  let burnRate: number | undefined;
  if (cash > 0 && netIncome < 0) {
    burnRate = -netIncome / 12; // monthly burn proxy from annual net loss
    runwayMonths = burnRate > 0 ? cash / burnRate : undefined;
    if (runwayMonths !== undefined && runwayMonths > 999) runwayMonths = 999;
  }

  const liquidityMetrics: ProfessionalReviewLiquidityMetrics = {
    currentRatio: metrics.currentRatio,
    runwayMonths,
    burnRate,
  };

  return {
    covenantResult,
    liquidityMetrics,
    // priorLiquidityMetrics left undefined unless caller provides prior-period data
  };
}
