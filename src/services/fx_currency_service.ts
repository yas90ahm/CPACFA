/**
 * FX currency service — current-rate translation (CTA), temporal remeasurement (ASC 830 / IAS 21).
 * Uses decimal.js for currency math.
 */

import type {
  FxBalanceLine,
  TranslationResultWithCTA,
  RemeasurementResult,
} from '../types/fx_currency.js';
import { from, round2, minus, plus, sumRound2 } from '../utils/decimal.js';

export interface FxRates {
  /** Closing rate: local -> reporting (e.g. CAD: 0.74 for USD) */
  closing?: Record<string, number>;
  /** Average rate for period (income/expense) */
  average?: Record<string, number>;
  /** Historic rate (equity, nonmonetary) */
  historic?: Record<string, number>;
}

/**
 * Current-rate method: assets/liabilities at closing, income/expense at average, equity at historic.
 * Translation difference goes to CTA (equity).
 */
export function translateToReportingCurrency(
  lines: FxBalanceLine[],
  reportingCurrency: string,
  fxRates: FxRates,
  _method: 'current_rate' | 'temporal' = 'current_rate'
): TranslationResultWithCTA {
  const closing = fxRates.closing ?? fxRates.average ?? {};
  const average = fxRates.average ?? closing;
  const historic = fxRates.historic ?? closing;

  const resultLines: TranslationResultWithCTA['lines'] = [];
  let totalTranslated = 0;
  let equityTranslation = 0;
  let equityHistoric = 0;

  for (const line of lines) {
    const curr = line.currency;
    const rate =
      line.currency === reportingCurrency
        ? 1
        : (line.balanceType === 'income' || line.balanceType === 'expense'
            ? average[curr] ?? closing[curr] ?? 1
            : line.balanceType === 'equity'
              ? historic[curr] ?? closing[curr] ?? 1
              : closing[curr] ?? 1);
    const translated = from(line.amount).times(rate).toDecimalPlaces(2).toNumber();
    const rateType =
      line.balanceType === 'income' || line.balanceType === 'expense'
        ? 'average'
        : line.balanceType === 'equity'
          ? 'historic'
          : 'closing';
    resultLines.push({
      label: line.label,
      originalAmount: line.amount,
      currency: curr,
      translatedAmount: round2(translated),
      rateType,
    });
    totalTranslated += translated;
    if (line.balanceType === 'equity') {
      equityTranslation += translated;
      equityHistoric += from(line.amount).times(historic[curr] ?? closing[curr] ?? 1).toNumber();
    }
  }

  // CTA: plug so that assets - liabilities - equity = 0 in reporting currency, or approximate
  const assetLiabilityTotal = sumRound2(
    resultLines.filter((l) => l.rateType === 'closing').map((l) => l.translatedAmount)
  );
  const incomeExpenseTotal = sumRound2(
    resultLines.filter((l) => l.rateType === 'average').map((l) => l.translatedAmount)
  );
  const cta = round2(minus(assetLiabilityTotal, plus(incomeExpenseTotal, equityTranslation)));

  return {
    reportingCurrency,
    lines: resultLines,
    totalTranslated: round2(totalTranslated),
    cta,
  };
}

/**
 * Temporal (remeasurement) method: monetary at closing, nonmonetary at historic.
 * Remeasurement gain/loss to P&L.
 */
export function remeasureToFunctionalCurrency(
  lines: FxBalanceLine[],
  functionalCurrency: string,
  fxRates: FxRates
): RemeasurementResult {
  const closing = fxRates.closing ?? fxRates.average ?? {};
  const historic = fxRates.historic ?? closing;

  const resultLines: RemeasurementResult['lines'] = [];
  let totalTranslated = 0;

  for (const line of lines) {
    const curr = line.currency;
    const rate =
      curr === functionalCurrency
        ? 1
        : line.balanceType === 'monetary'
          ? closing[curr] ?? 1
          : historic[curr] ?? closing[curr] ?? 1;
    const translated = from(line.amount).times(rate).toDecimalPlaces(2).toNumber();
    const rateType =
      line.balanceType === 'monetary' ? 'closing' : 'historic';
    resultLines.push({
      label: line.label,
      originalAmount: line.amount,
      currency: curr,
      translatedAmount: round2(translated),
      rateType,
    });
    totalTranslated += translated;
  }

  // Remeasurement gain/loss: simplified as (sum of monetary at closing) + (sum of nonmonetary at historic) vs local total at closing
  const localTotal = lines.reduce((s, l) => s + l.amount, 0);
  const localRate = closing[lines[0]?.currency ?? functionalCurrency] ?? 1;
  const remeasurementGainLoss = round2(minus(totalTranslated, from(localTotal).times(localRate).toNumber()));

  return {
    remeasurementGainLoss,
    reportingCurrency: functionalCurrency,
    lines: resultLines,
  };
}
