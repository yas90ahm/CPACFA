/**
 * Zod schemas for equity method investments API routes (ASC 323 / IAS 28).
 */

import { z } from 'zod';
import { isoDateSchema, amountSchema, positiveAmountSchema, nonNegativeAmountSchema, percentageSchema, idParamSchema } from './commonSchemas.js';

// ============================================================================
// Create Investment
// ============================================================================

export const basisDifferenceComponentSchema = z.object({
  description: z.string().min(1),
  amount: amountSchema,
  amortizationYears: z.number().int().positive().optional(),
});

export const createInvestmentSchema = z.object({
  investeeName: z.string().min(1, 'Investee name required'),
  investmentDate: isoDateSchema,
  ownershipPercent: percentageSchema.refine(val => val > 0, 'Ownership percent must be greater than 0'),
  initialInvestment: positiveAmountSchema,
  currentCarryingValue: nonNegativeAmountSchema.optional(),
  basisDifference: amountSchema.optional(),
  basisDifferenceComponents: z.array(basisDifferenceComponentSchema).optional(),
  isSignificantInfluence: z.boolean().optional(),
  influenceBasis: z.enum(['board_seat', 'material_transactions', 'ownership_20_50']).optional(),
  notes: z.string().optional(),
});

// ============================================================================
// Update Investment
// ============================================================================

export const updateInvestmentSchema = z.object({
  currentCarryingValue: nonNegativeAmountSchema.optional(),
  basisDifference: amountSchema.optional(),
});

// ============================================================================
// Record Income
// ============================================================================

export const recordIncomeSchema = z.object({
  periodLabel: z.string().min(1, 'Period label required'),
  investeeNetIncome: amountSchema,
  dividendsReceived: nonNegativeAmountSchema.optional(),
  impairmentLoss: nonNegativeAmountSchema.optional(),
});

// ============================================================================
// Agentic Routes
// ============================================================================

export const assessInfluenceSchema = z.object({
  ownershipPercent: percentageSchema,
  factors: z.object({
    hasBoardSeat: z.boolean().optional(),
    hasMaterialTransactions: z.boolean().optional(),
    sharesKeyPersonnel: z.boolean().optional(),
  }).optional(),
});

export const reconcileBasisSchema = z.object({
  purchasePrice: positiveAmountSchema,
  bookValueShare: amountSchema,
  fairValueAdjustments: z.string().optional(),
});

export const assessImpairmentIndicatorsSchema = z.object({
  investeePerformance: z.object({
    revenueChange: z.number(),
    marginChange: z.number(),
    lossYears: z.number().int().nonnegative(),
  }),
});

// ============================================================================
// Export param schemas
// ============================================================================

export const investmentIdParamSchema = idParamSchema;
