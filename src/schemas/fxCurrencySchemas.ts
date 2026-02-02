/**
 * Zod schemas for FX currency API routes (ASC 830 / IAS 21).
 */

import { z } from 'zod';
import { amountSchema } from './commonSchemas.js';

export const balanceTypeSchema = z.enum([
  'monetary',
  'nonmonetary',
  'equity',
  'income',
  'expense',
]);

export const fxBalanceLineSchema = z.object({
  label: z.string(),
  account: z.string().optional(),
  amount: amountSchema,
  currency: z.string(),
  balanceType: balanceTypeSchema.optional(),
});

export const fxRatesSchema = z.object({
  closing: z.record(z.string(), z.number()).optional(),
  average: z.record(z.string(), z.number()).optional(),
  historic: z.record(z.string(), z.number()).optional(),
});

export const translateSchema = z.object({
  lines: z.array(fxBalanceLineSchema),
  reportingCurrency: z.string().min(1),
  fxRates: fxRatesSchema,
  method: z.enum(['current_rate', 'temporal']).optional(),
});

export const remeasureSchema = z.object({
  lines: z.array(fxBalanceLineSchema),
  functionalCurrency: z.string().min(1),
  fxRates: fxRatesSchema,
});

export const suggestFunctionalCurrencySchema = z.object({
  operationsSummary: z.string().min(1),
  primaryEconomicEnvironment: z.string().optional(),
});

export const generateFxFootnoteSchema = z.object({
  translationSummary: z.string().optional(),
  cta: amountSchema.optional(),
  remeasurementGainLoss: amountSchema.optional(),
  reportingCurrency: z.string().min(1),
  functionalCurrency: z.string().optional(),
  /** When provided, resolves to topic standard (asc830/ias21) for citation. */
  accountingStandard: z.enum(['ASPE', 'IFRS', 'FRS102', 'US_GAAP']).optional(),
});
