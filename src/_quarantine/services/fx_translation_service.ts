/**
 * FX translation: translate amounts by currency to reporting currency (Phase 1 / consolidation).
 * Uses decimal.js for currency math.
 */

import { mul, sumRound2 } from '../utils/decimal.js';

export interface FxTranslationLine {
  label: string;
  amount: number;
  currency: string;
}

export interface FxTranslationInput {
  /** Lines with amount and currency */
  lines: FxTranslationLine[];
  /** Reporting currency (e.g. USD) */
  reportingCurrency: string;
  /** FX rates: source currency -> rate to reporting (e.g. CAD: 0.74 for USD) */
  fxRates: Record<string, number>;
}

export interface FxTranslationResult {
  reportingCurrency: string;
  lines: { label: string; originalAmount: number; currency: string; translatedAmount: number }[];
  totalTranslated: number;
}

export function translateToReportingCurrency(input: FxTranslationInput): FxTranslationResult {
  const { lines, reportingCurrency, fxRates } = input;
  const resultLines: FxTranslationResult['lines'] = [];

  for (const line of lines) {
    const rate = line.currency === reportingCurrency ? 1 : (fxRates[line.currency] ?? 1);
    const translated = mul(line.amount, rate);
    resultLines.push({
      label: line.label,
      originalAmount: line.amount,
      currency: line.currency,
      translatedAmount: translated,
    });
  }

  const totalTranslated = sumRound2(resultLines.map((l) => l.translatedAmount));
  return {
    reportingCurrency,
    lines: resultLines,
    totalTranslated,
  };
}
