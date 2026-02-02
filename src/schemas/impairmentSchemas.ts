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
// Goodwill Allocation
// ============================================================================

export const allocateGoodwillSchema = z.object({
  cguId: z.string().min(1, 'CGU ID required'),
  goodwillAmount: positiveAmountSchema,
  allocationMethod: z.string().optional(),
  rationale: z.string().optional(),
});

// ============================================================================
// Impairment Test
// ============================================================================

export const performImpairmentTestSchema = z.object({
  cguId: z.string().min(1, 'CGU ID required'),
  testDate: isoDateSchema,
  carryingAmount: positiveAmountSchema,
  recoverableAmount: positiveAmountSchema,
  valueInUse: positiveAmountSchema.optional(),
  fairValueLessCosts: positiveAmountSchema.optional(),
  impairmentLoss: nonNegativeAmountSchema.optional(),
  notes: z.string().optional(),
});

// ============================================================================
// Value in Use Calculation
// ============================================================================

export const calculateValueInUseSchema = z.object({
  cashFlows: z.array(z.number()).min(1, 'Cash flows required'),
  discountRate: percentageSchema,
  terminalValue: z.number().optional(),
});

// ============================================================================
// Sensitivity Analysis
// ============================================================================

export const impairmentSensitivitySchema = z.object({
  baseCashFlows: z.array(z.number()).min(1, 'Base cash flows required'),
  baseDiscountRate: percentageSchema,
  carryingAmount: positiveAmountSchema,
  discountRateRange: z.object({
    min: percentageSchema,
    max: percentageSchema,
    step: z.number().positive().optional(),
  }).optional(),
  cashFlowVariance: z.number().optional(),
});

// ============================================================================
// Agentic Routes
// ============================================================================

export const suggestCGUsSchema = z.object({
  businessDescription: z.string().min(1, 'Business description required'),
  organizationalStructure: z.string().optional(),
});

export const performQualitativeTestSchema = z.object({
  cguId: z.string().min(1, 'CGU ID required'),
  recentPerformance: z.object({
    revenueChange: z.number().optional(),
    marginChange: z.number().optional(),
    marketShareChange: z.number().optional(),
  }).optional(),
  externalFactors: z.array(z.string()).optional(),
});

export const detectTriggersSchema = z.object({
  cguId: z.string().min(1, 'CGU ID required'),
  marketConditions: z.record(z.unknown()).optional(),
  operatingMetrics: z.record(z.unknown()).optional(),
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
  industry: z.string().min(1, 'Industry required'),
  riskProfile: z.enum(['low', 'medium', 'high']).optional(),
  geography: z.string().optional(),
});

// ============================================================================
// Export param schemas
// ============================================================================

export const cguIdParamSchema = idParamSchema;
