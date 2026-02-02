/**
 * Zod schemas for deferred tax API routes (ASC 740 / IAS 12).
 */

import { z } from 'zod';
import { isoDateSchema, amountSchema, percentageSchema, idParamSchema } from './commonSchemas.js';

// ============================================================================
// Enums
// ============================================================================

export const itemTypeSchema = z.enum(['temporary_difference', 'nol', 'tax_credit']);
export const originSchema = z.enum(['asset', 'liability', 'equity', 'revenue', 'expense', 'other']);

// ============================================================================
// Calculate Deferred Tax
// ============================================================================

export const calculateDeferredTaxBodySchema = z.object({
  periodLabel: z.string().min(1, 'Period label required'),
  taxRate: z.number().min(0).max(1, 'Tax rate must be between 0 and 1'),
});

// ============================================================================
// Create Deferred Tax Item
// ============================================================================

export const createDeferredTaxItemSchema = z.object({
  periodLabel: z.string().min(1, 'Period label required'),
  itemType: itemTypeSchema,
  description: z.string().min(1, 'Description required'),
  origin: originSchema.optional(),
  bookBasis: amountSchema.optional(),
  taxBasis: amountSchema.optional(),
  temporaryDifference: amountSchema.optional(),
  nolAmount: amountSchema.optional(),
  creditAmount: amountSchema.optional(),
  taxRate: percentageSchema.optional(),
  deferredTaxAsset: amountSchema.optional(),
  deferredTaxLiability: amountSchema.optional(),
  reversalPattern: z.string().optional(),
  sourceAccount: z.string().optional(),
  expirationDate: z.string().optional(),
  notes: z.string().optional(),
});

// ============================================================================
// Update Deferred Tax Item
// ============================================================================

export const updateDeferredTaxItemSchema = createDeferredTaxItemSchema.partial();

// ============================================================================
// List Items Query
// ============================================================================

export const listDeferredTaxItemsQuerySchema = z.object({
  periodLabel: z.string().optional(),
});

// ============================================================================
// Valuation Allowance
// ============================================================================

export const createValuationAllowanceSchema = z.object({
  itemId: z.string().min(1, 'Item ID required'),
  assessmentDate: isoDateSchema,
  allowanceAmount: amountSchema,
  realizabilityAssessment: z.string(),
  positiveSources: z.array(z.string()).optional(),
  negativeSources: z.array(z.string()).optional(),
  conclusion: z.string().optional(),
});

export const listValuationAllowanceQuerySchema = z.object({
  periodLabel: z.string().optional(),
});

// ============================================================================
// Rate Change
// ============================================================================

export const createRateChangeSchema = z.object({
  periodLabel: z.string().min(1, 'Period label required'),
  effectiveDate: isoDateSchema,
  oldRate: percentageSchema,
  newRate: percentageSchema,
  description: z.string().optional(),
});

// ============================================================================
// Agentic Routes
// ============================================================================

export const scanTemporaryDifferencesSchema = z.object({
  financialData: z.record(z.unknown()),
});

export const assessValuationAllowanceSchema = z.object({
  deferredTaxAssets: amountSchema,
  historicalProfitability: z.array(z.number()).optional(),
  projectedIncome: z.array(z.number()).optional(),
  taxPlanningStrategies: z.array(z.string()).optional(),
});

export const analyzeRateChangeSchema = z.object({
  oldRate: percentageSchema,
  newRate: percentageSchema,
  currentDTA: amountSchema,
  currentDTL: amountSchema,
});

export const generateTaxFootnoteSchema = z.object({
  deferredTaxSummary: z.object({
    totalDTA: amountSchema,
    totalDTL: amountSchema,
    valuationAllowance: amountSchema.optional(),
    netDeferredTax: amountSchema,
  }),
});

// ============================================================================
// Export param schemas
// ============================================================================

export const deferredTaxItemIdParamSchema = idParamSchema;
