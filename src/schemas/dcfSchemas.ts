/**
 * Zod schemas for DCF valuation API routes.
 */

import { z } from 'zod';
import { positiveAmountSchema, nonNegativeAmountSchema, percentageSchema, idParamSchema } from './commonSchemas.js';

// ============================================================================
// Create DCF Model
// ============================================================================

export const createDCFModelSchema = z.object({
  companyName: z.string().min(1, 'Company name required'),
  cashFlows: z.array(z.number()).min(1, 'At least one cash flow required'),
  wacc: percentageSchema,
  terminalGrowthRate: percentageSchema,
  netDebt: z.number().finite().optional(),
  sharesOutstanding: positiveAmountSchema.optional(),
  assumptions: z.string().optional(),
});

// ============================================================================
// Calculate DCF (without saving)
// ============================================================================

export const calculateDCFSchema = z.object({
  companyName: z.string().min(1, 'Company name required'),
  cashFlows: z.array(z.number()).min(1, 'At least one cash flow required'),
  wacc: percentageSchema,
  terminalGrowthRate: percentageSchema,
  netDebt: z.number().finite().optional(),
  sharesOutstanding: positiveAmountSchema.optional(),
});

// ============================================================================
// WACC Calculation
// ============================================================================

export const waccInputSchema = z.object({
  riskFreeRate: percentageSchema,
  beta: z.number().finite('Beta must be finite'),
  marketRiskPremium: percentageSchema,
  costOfDebt: percentageSchema,
  taxRate: percentageSchema,
  debtWeight: percentageSchema,
  equityWeight: percentageSchema,
  dcfModelId: z.string().optional(),
  rationale: z.string().optional(),
});

export const calculateWACCSchema = waccInputSchema.omit({ dcfModelId: true, rationale: true });

// ============================================================================
// WACC List Query
// ============================================================================

export const listWACCQuerySchema = z.object({
  dcfModelId: z.string().optional(),
});

// ============================================================================
// Sensitivity Analysis
// ============================================================================

export const sensitivityAnalysisSchema = z.object({
  baseCashFlows: z.array(z.number()).min(1, 'Base cash flows required'),
  baseWACC: percentageSchema,
  baseGrowthRate: percentageSchema,
  netDebt: z.number().finite().optional(),
  sharesOutstanding: positiveAmountSchema.optional(),
  waccRange: z.object({
    min: percentageSchema,
    max: percentageSchema,
    step: z.number().positive().optional(),
  }).optional(),
  growthRange: z.object({
    min: percentageSchema,
    max: percentageSchema,
    step: z.number().positive().optional(),
  }).optional(),
  dcfModelId: z.string().optional(),
});

// ============================================================================
// Agentic Routes
// ============================================================================

export const projectRevenueSchema = z.object({
  historicals: z.array(z.number()).min(1, 'Historical revenue required'),
  guidance: z.string().optional(),
  industry: z.string().optional(),
});

export const projectMarginsSchema = z.object({
  historicalMargins: z.array(z.number()).min(1, 'Historical margins required'),
  projectedRevenue: z.array(z.number()).min(1, 'Projected revenue required'),
  industry: z.string().optional(),
});

export const suggestWACCSchema = z.object({
  ticker: z.string().optional(),
  industry: z.string().min(1, 'Industry required'),
  creditRating: z.string().optional(),
  debtToEquity: z.number().nonnegative().optional(),
});

export const suggestGrowthSchema = z.object({
  industry: z.string().min(1, 'Industry required'),
  currentGrowthRate: z.number().optional(),
});

export const suggestBetaSchema = z.object({
  industry: z.string().min(1, 'Industry required'),
  companySize: z.enum(['small', 'mid', 'large']).optional(),
});

export const generateValuationSummarySchema = z.object({
  dcfResult: z.object({
    enterpriseValue: z.number(),
    equityValue: z.number(),
    valuePerShare: z.number().optional(),
    wacc: z.number(),
    terminalGrowthRate: z.number(),
  }),
});

// ============================================================================
// Export param schemas
// ============================================================================

export const dcfModelIdParamSchema = idParamSchema;
