export interface FxTranslationInput {
  lines: TranslationLine[];
  reportingCurrency: string;
  fxRates: {
    closing?: Record<string, number>;
    average?: Record<string, number>;
    historic?: Record<string, number>;
  };
  method?: 'current_rate';
}

export interface TranslationLine {
  label: string;
  account?: string;
  amount: number;
  currency: string;
  balanceType?: 'monetary' | 'nonmonetary' | 'equity' | 'income' | 'expense';
}

export interface TranslationResultLine {
  label: string;
  originalAmount: number;
  currency: string;
  translatedAmount: number;
  rateType: string;
}

export interface TranslationResult {
  reportingCurrency: string;
  lines: TranslationResultLine[];
  totalTranslated: number;
  cta: number;
}

export interface RemeasurementResult {
  remeasurementGainLoss: number;
  reportingCurrency: string;
  lines: TranslationResultLine[];
}
