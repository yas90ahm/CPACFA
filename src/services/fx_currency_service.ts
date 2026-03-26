/**
 * FX currency service — current-rate translation (CTA), temporal remeasurement (ASC 830 / IAS 21).
 * Uses decimal.js for currency math.
 * computeUnrealizedFxGainLoss ported from backend/tax/fx_engine.py for API parity.
 */

import type { FxBalanceLine, FxRates, FxPosition, TranslationResultWithCTA, RemeasurementResult } from '../types/fx_currency.js';
import { from, round2, sumRound2, minus, plus } from '../utils/decimal.js';

export type { FxRates, FxPosition };

/**
 * Current-rate method: assets/liabilities at closing, income/expense at average, equity at historic.
 * Translation difference goes to CTA (equity).
 */
export function translateToReportingCurrency(
  lines: FxBalanceLine[],
  reportingCurrency: string,
  fxRates: FxRates,
  _method: 'current_rate' = 'current_rate'
): TranslationResultWithCTA {
  const closing = fxRates.closing ?? fxRates.average ?? {};
  const average = fxRates.average ?? closing;
  const historic = fxRates.historic ?? closing;

  const resultLines: TranslationResultWithCTA['lines'] = [];
  let totalTranslated = 0;
  let equityTranslation = 0;

  for (const line of lines) {
    const curr = line.currency;
    const rate = line.currency === reportingCurrency
      ? 1
      : (line.balanceType === 'income' || line.balanceType === 'expense'
        ? average[curr] ?? closing[curr] ?? 1
        : line.balanceType === 'equity'
          ? historic[curr] ?? closing[curr] ?? 1
          : closing[curr] ?? 1);

    const translated = from(line.amount).times(rate).toDecimalPlaces(2).toNumber();
    const rateType = line.balanceType === 'income' || line.balanceType === 'expense'
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

    totalTranslated = plus(totalTranslated, translated);
    if (line.balanceType === 'equity') {
      equityTranslation = plus(equityTranslation, translated);
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
    const rate = curr === functionalCurrency
      ? 1
      : line.balanceType === 'monetary'
        ? closing[curr] ?? 1
        : historic[curr] ?? closing[curr] ?? 1;

    const translated = from(line.amount).times(rate).toDecimalPlaces(2).toNumber();
    const rateType = line.balanceType === 'monetary' ? 'closing' : 'historic';

    resultLines.push({
      label: line.label,
      originalAmount: line.amount,
      currency: curr,
      translatedAmount: round2(translated),
      rateType,
    });

    totalTranslated = plus(totalTranslated, translated);
  }

  // Remeasurement gain/loss: simplified as (sum of translated) vs local total at closing
  const localTotal = sumRound2(lines.map((l) => l.amount));
  const localRate = closing[lines[0]?.currency ?? functionalCurrency] ?? 1;
  const remeasurementGainLoss = round2(minus(totalTranslated, from(localTotal).times(localRate).toNumber()));

  return {
    remeasurementGainLoss,
    reportingCurrency: functionalCurrency,
    lines: resultLines,
  };
}

/**
 * Compute unrealized FX gain/loss for monetary items per ASC 830-20-35.
 * Remeasure monetary items at current rate; unrealized G/L = current functional value minus prior period functional value.
 * If priorFunctionalAmounts not provided, prior is taken as current (no change).
 */
export function computeUnrealizedFxGainLoss(
  positions: FxPosition[],
  functionalCurrency: string,
  currentRates: Record<string, number>,
  priorFunctionalAmounts?: Record<string, number>,
  _asOfDate?: string
): number {
  const prior = priorFunctionalAmounts ?? {};
  let totalUnrealized = 0;

  positions.forEach((pos, i) => {
    if (pos.currency === functionalCurrency) return;
    const rate = currentRates[pos.currency];
    if (rate == null) return;
    if (!pos.isMonetary) return;

    const currentFunctional = from(pos.amount).times(rate).toDecimalPlaces(2).toNumber();
    const key = pos.accountCode ?? String(i);
    const priorFunctional = prior[key] ?? currentFunctional;
    totalUnrealized = plus(totalUnrealized, from(currentFunctional).minus(priorFunctional).toDecimalPlaces(2).toNumber());
  });

  return round2(totalUnrealized);
}
