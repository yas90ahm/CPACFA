/**
 * Integrity Conflict Service — Cross-check CPA (Accounting Standards) outputs against covenant thresholds.
 * Used by the export route to block export when covenant breaches would be fatal.
 */

import { monitorCovenants } from './enterprise_m_and_a_financing_service.js';

/** Covenant thresholds for export gate (debt/equity, debt/EBITDA, interest coverage, current ratio). */
const COVENANT_THRESHOLDS = {
  maxDebtToEquity: 3,
  maxDebtToEbitda: 4,
  minInterestCoverage: 2,
  minCurrentRatio: 1,
};

export type ConflictSeverity = 'Fatal' | 'Warning';

export interface IntegrityConflict {
  severity: ConflictSeverity;
  source: string;
  message: string;
  /** Human-readable CPA vs CFA discrepancy for 409 response */
  cpaVsCfa?: string;
}

export interface IntegrityConflictInput {
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  /** Optional: current assets for current ratio */
  currentAssets?: number;
  /** Optional: current liabilities for current ratio */
  currentLiabilities?: number;
  /** Optional: interest-bearing debt (for covenants); defaults to totalLiabilities if not provided */
  debt?: number;
  /** Optional: EBITDA for debt/EBITDA covenant */
  ebitda?: number;
  /** Optional: interest expense for interest coverage covenant */
  interestExpense?: number;
  /** Pre-computed ratios from CFA side (if available) */
  currentRatio?: number;
  debtToEquity?: number;
}

export interface DetectIntegrityConflictsResult {
  conflicts: IntegrityConflict[];
  hasFatal: boolean;
}

/**
 * Cross-check CPA (balance sheet / P&L) against CFA covenant thresholds.
 * Example: If CPA capitalizes a lease (adding debt to BS), this checks whether the new debt level violates hard-coded covenants.
 * Returns Fatal when a covenant breach would make export illegal (e.g. debt/EBITDA over limit, current ratio below minimum).
 */
export function detectIntegrityConflicts(input: IntegrityConflictInput): DetectIntegrityConflictsResult {
  const conflicts: IntegrityConflict[] = [];
  const {
    totalAssets,
    totalLiabilities,
    totalEquity,
    currentAssets,
    currentLiabilities,
    debt,
    ebitda,
    interestExpense,
    currentRatio: suppliedCurrentRatio,
    debtToEquity: suppliedDebtToEquity,
  } = input;

  const thresholds = COVENANT_THRESHOLDS;
  const debtForCovenant = debt ?? totalLiabilities;

  const debtToEquity =
    suppliedDebtToEquity ??
    (totalEquity !== 0 ? totalLiabilities / totalEquity : 0);

  if (totalEquity > 0 && debtToEquity > thresholds.maxDebtToEquity) {
    conflicts.push({
      severity: 'Fatal',
      source: 'Covenant',
      message: `Debt-to-Equity ratio ${debtToEquity.toFixed(2)} exceeds maximum allowed ${thresholds.maxDebtToEquity}.`,
      cpaVsCfa: `CPA balance sheet implies Debt/Equity = ${debtToEquity.toFixed(2)}; CFA covenant limit is ${thresholds.maxDebtToEquity}. Export blocked.`,
    });
  }

  const currentRatio =
    suppliedCurrentRatio ??
    (currentAssets != null && currentLiabilities != null && currentLiabilities > 0
      ? currentAssets / currentLiabilities
      : undefined);

  if (currentRatio != null && currentRatio < thresholds.minCurrentRatio) {
    conflicts.push({
      severity: 'Fatal',
      source: 'Covenant',
      message: `Current ratio ${currentRatio.toFixed(2)} is below minimum required ${thresholds.minCurrentRatio}.`,
      cpaVsCfa: `CPA-derived current ratio ${currentRatio.toFixed(2)} violates CFA liquidity covenant (min ${thresholds.minCurrentRatio}). Export blocked.`,
    });
  }

  if (ebitda != null && ebitda > 0 && debtForCovenant > 0) {
    const covenantResult = monitorCovenants(
      { debt: debtForCovenant, ebitda, interestExpense: interestExpense ?? 0 },
      {
        maxDebtToEbitda: thresholds.maxDebtToEbitda,
        minInterestCoverage: thresholds.minInterestCoverage,
      }
    );
    if (covenantResult.debtToEbitdaBreach) {
      conflicts.push({
        severity: 'Fatal',
        source: 'Covenant',
        message: `Debt/EBITDA ${covenantResult.debtToEbitda.toFixed(2)}x exceeds maximum ${thresholds.maxDebtToEbitda}x.`,
        cpaVsCfa: `CPA balance sheet (debt) vs CFA covenant: Debt/EBITDA ${covenantResult.debtToEbitda.toFixed(2)}x exceeds limit ${thresholds.maxDebtToEbitda}x. Export blocked.`,
      });
    }
    if (covenantResult.interestCoverageBreach && (interestExpense ?? 0) > 0) {
      conflicts.push({
        severity: 'Fatal',
        source: 'Covenant',
        message: `Interest coverage ${covenantResult.interestCoverage.toFixed(2)}x is below minimum ${thresholds.minInterestCoverage}x.`,
        cpaVsCfa: `CPA P&L (EBITDA/interest) vs CFA covenant: Interest coverage ${covenantResult.interestCoverage.toFixed(2)}x below minimum ${thresholds.minInterestCoverage}x. Export blocked.`,
      });
    }
  }

  const hasFatal = conflicts.some((c) => c.severity === 'Fatal');
  return { conflicts, hasFatal };
}
