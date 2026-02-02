/**
 * Zod schemas for stock-based compensation API routes (ASC 718 / IFRS 2).
 */

import { z } from 'zod';
import { isoDateSchema, optionalIsoDateSchema, nonNegativeAmountSchema, positiveAmountSchema, idParamSchema } from './commonSchemas.js';

// ============================================================================
// Enums
// ============================================================================

export const grantTypeSchema = z.enum(['rsu', 'option', 'espp', 'sar']);
export const vestingTypeSchema = z.enum(['time', 'performance', 'market']);
export const grantStatusSchema = z.enum(['active', 'vested', 'forfeited', 'exercised']);
export const vestingFrequencySchema = z.enum(['monthly', 'quarterly', 'annual']);
export const valuationMethodSchema = z.enum(['black-scholes', 'binomial', 'monte-carlo', '409a', 'market']);

// ============================================================================
// Create Grant
// ============================================================================

export const vestingScheduleItemSchema = z.object({
  date: z.string(),
  shares: z.number().int().positive(),
  vested: z.boolean(),
});

export const createGrantSchema = z.object({
  grantDate: isoDateSchema,
  grantType: grantTypeSchema,
  sharesGranted: z.number().int().positive('Shares granted must be a positive integer'),
  vestingType: vestingTypeSchema,
  recipientId: z.string().optional(),
  recipientName: z.string().optional(),
  grantPrice: nonNegativeAmountSchema.optional(),
  fairValuePerShare: nonNegativeAmountSchema.optional(),
  vestingSchedule: z.array(vestingScheduleItemSchema).optional(),
  vestingPeriodMonths: z.number().int().positive().optional(),
  cliffMonths: z.number().int().nonnegative().optional(),
  vestingFrequency: vestingFrequencySchema.optional(),
  expirationDate: optionalIsoDateSchema,
  status: grantStatusSchema.optional(),
  forfeitureDate: optionalIsoDateSchema,
  exerciseDate: optionalIsoDateSchema,
  exercisePrice: nonNegativeAmountSchema.optional(),
  notes: z.string().optional(),
});

// ============================================================================
// Update Grant
// ============================================================================

export const updateGrantSchema = createGrantSchema.partial();

// ============================================================================
// List Grants Query
// ============================================================================

export const listGrantsQuerySchema = z.object({
  status: grantStatusSchema.optional(),
  grantType: grantTypeSchema.optional(),
});

// ============================================================================
// Record Valuation
// ============================================================================

export const recordValuationSchema = z.object({
  valuationDate: isoDateSchema,
  method: valuationMethodSchema,
  fairValuePerShare: positiveAmountSchema,
  parameters: z.record(z.unknown()).optional(),
});

// ============================================================================
// Calculate Expense
// ============================================================================

export const calculateExpenseSchema = z.object({
  grantId: z.string().min(1),
  periodLabel: z.string().min(1),
});

// ============================================================================
// Get Expense Query
// ============================================================================

export const getExpenseQuerySchema = z.object({
  periodLabel: z.string().min(1, 'Period label required'),
});

// ============================================================================
// Calculate Dilution
// ============================================================================

export const calculateDilutionSchema = z.object({
  basicShares: z.number().int().positive('Basic shares must be positive'),
  stockPrice: positiveAmountSchema,
});

// ============================================================================
// Black-Scholes Calculation
// ============================================================================

export const blackScholesSchema = z.object({
  stockPrice: positiveAmountSchema,
  strikePrice: nonNegativeAmountSchema,
  riskFreeRate: z.number().min(0).max(1, 'Risk-free rate must be between 0 and 1'),
  volatility: z.number().min(0).max(10, 'Volatility must be between 0 and 10'),
  timeToExpiration: z.number().positive('Time to expiration must be positive'),
  dividendYield: z.number().min(0).max(1).optional(),
});

// ============================================================================
// Agentic Routes
// ============================================================================

export const suggestGrantsSchema = z.object({
  documentText: z.string().min(1, 'Document text required'),
});

export const suggestBlackScholesParamsSchema = z.object({
  ticker: z.string().optional(),
  industry: z.string().min(1, 'Industry required'),
  marketCap: z.number().positive().optional(),
  isPublic: z.boolean().optional(),
});

export const estimateForfeitureSchema = z.object({
  totalGrants: z.number().int().nonnegative().optional(),
  forfeitedGrants: z.number().int().nonnegative().optional(),
  avgTenureYears: z.number().positive().optional(),
  industryTurnoverRate: z.number().min(0).max(1).optional(),
});

export const explainDilutionSchema = z.object({
  basicShares: z.number().int().positive(),
  dilutedShares: z.number().int().positive(),
  stockPrice: positiveAmountSchema,
  optionsOutstanding: z.number().int().nonnegative().optional(),
});

export const analyzeModificationSchema = z.object({
  originalTerms: z.record(z.unknown()),
  newTerms: z.record(z.unknown()),
});

// ============================================================================
// Export param schema
// ============================================================================

export const grantIdParamSchema = idParamSchema;
