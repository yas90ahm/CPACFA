/**
 * Zod schemas for impairment testing API routes (ASC 350 / IAS 36).
 */

import { z } from 'zod';
import { isoDateSchema, amountSchema, positiveAmountSchema, nonNegativeAmountSchema, percentageSchema, idParamSchema } from './commonSchemas.js';

// ============================================================================
// Create CGU
// ============================================================================

export const createCGUSchema = z.object({
  cguName: z.string().min(1, 'CGU name required'),
  description: z.string().optional(),
  carryingAmount: nonNegativeAmountSchema.optional(),
  allocatedGoodwill: nonNegativeAmountSchema.optional(),
});

// ============================================================================
// Update CGU
// ============================================================================

export const updateCGUSchema = createCGUSchema.partial();

// ============================================================================
// Goodwill Allocation (route body: cguId, acquisitionDate?, goodwillAmount, allocationRationale?)
// ============================================================================

export const allocateGoodwillSchema = z.object({
  cguId: z.string().min(1, 'CGU ID required'),
  acquisitionDate: isoDateSchema.optional(),
  goodwillAmount: positiveAmountSchema,
  allocationRationale: z.string().optional(),
});

// ============================================================================
// Impairment Test (route body for performImpairmentTest — matches ImpairmentTestInput)
// ============================================================================

export const performImpairmentTestSchema = z.object({
  cguId: z.string().optional(),
  periodLabel: z.string().min(1, 'Period label required'),
  assetType: z.enum(['goodwill', 'intangible', 'ppe', 'investment']),
  assetDescription: z.string().optional(),
  carryingAmount: amountSchema,
  method: z.enum(['value_in_use', 'fair_value_less_costs']),
  cashFlows: z.array(z.number().finite()).optional(),
  discountRate: z.number().finite().optional(),
  terminalGrowthRate: z.number().finite().optional(),
  fairValue: z.number().finite().optional(),
  costsToSell: z.number().finite().optional(),
});

// ============================================================================
// Value in Use Calculation
// ============================================================================

export const calculateValueInUseSchema = z.object({
  cashFlows: z.array(z.number().finite()).min(1, 'Cash flows required'),
  discountRate: z.number().finite(),
  growthRate: z.number().finite().optional(),
});

// ============================================================================
// Sensitivity Analysis (route: carryingAmount, cashFlows, discountRate, growthRate?)
// ============================================================================

export const impairmentSensitivitySchema = z.object({
  carryingAmount: z.number().finite(),
  cashFlows: z.array(z.number().finite()).min(1, 'Cash flows required'),
  discountRate: z.number().finite(),
  growthRate: z.number().finite().optional(),
});

// ============================================================================
// Agentic Routes
// ============================================================================

export const suggestCGUsSchema = z.object({
  businessDescription: z.string().min(1, 'Business description required'),
  segments: z.array(z.object({ name: z.string(), revenue: z.number().finite() })).optional(),
});

export const performQualitativeTestSchema = z.object({
  cguName: z.string().min(1, 'CGU name required'),
  marketConditions: z.string().min(1, 'Market conditions required'),
  performance: z.record(z.unknown()).optional(),
});

export const detectTriggersSchema = z.object({
  cguName: z.string().min(1, 'CGU name required'),
  metrics: z.object({
    currentRevenue: z.number().finite(),
    priorRevenue: z.number().finite(),
    currentMargin: z.number().finite(),
    priorMargin: z.number().finite(),
    industryGrowth: z.number().finite().optional(),
    marketCapChange: z.number().finite().optional(),
  }),
});

export const generateImpairmentFootnoteSchema = z.object({
  impairmentTest: z.object({
    cguName: z.string(),
    carryingAmount: z.number(),
    recoverableAmount: z.number(),
    impairmentLoss: z.number(),
    testDate: z.string(),
  }),
});

export const suggestDiscountRateSchema = z.object({
  name: z.string().min(1, 'Name required'),
  industry: z.string().min(1, 'Industry required'),
  size: z.enum(['large', 'mid', 'small']).optional(),
});

// ============================================================================
// Export param schemas
// ============================================================================

export const cguIdParamSchema = idParamSchema;
