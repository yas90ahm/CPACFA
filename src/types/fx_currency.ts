/**
 * Foreign currency types (ASC 830 / IAS 21): functional currency, translation, remeasurement, CTA.
 */

export type TranslationMethod = 'current_rate' | 'temporal';

export type FunctionalCurrency = string; // e.g. USD, EUR
export type ReportingCurrency = string;

/** Balance line for translation/remeasurement: amount in local currency with classification */
export interface FxBalanceLine {
  label: string;
  account?: string;
  amount: number;
  currency: string;
  /** For current-rate: 'asset' | 'liability' | 'equity' | 'income' | 'expense' */
  balanceType?: 'monetary' | 'nonmonetary' | 'equity' | 'income' | 'expense';
}

/** CTA (cumulative translation adjustment) entry for disclosure */
export interface CTAEntry {
  periodLabel?: string;
  amount: number;
  reportingCurrency: string;
  source: string; // e.g. 'current_rate_translation'
}

/** Result of remeasurement (temporal method): gain/loss to P&L */
export interface RemeasurementResult {
  remeasurementGainLoss: number;
  reportingCurrency: string;
  lines: { label: string; originalAmount: number; currency: string; translatedAmount: number; rateType: string }[];
}

/** FX rates for translation: closing, average, and historic rates by currency code. */
export interface FxRates {
  closing?: Record<string, number>;
  average?: Record<string, number>;
  historic?: Record<string, number>;
}

/** Monetary/non-monetary position for unrealized FX gain/loss computation. */
export interface FxPosition {
  accountCode?: string;
  amount: number;
  currency: string;
  isMonetary: boolean;
}

/** Result of current-rate translation with CTA */
export interface TranslationResultWithCTA {
  reportingCurrency: string;
  lines: { label: string; originalAmount: number; currency: string; translatedAmount: number; rateType: string }[];
  totalTranslated: number;
  cta: number; // cumulative translation adjustment (equity)
}
