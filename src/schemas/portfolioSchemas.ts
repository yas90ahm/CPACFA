/**
 * Zod schemas for portfolio analytics API routes.
 */

import { z } from 'zod';
import { isoDateSchema, positiveAmountSchema, nonNegativeAmountSchema, idParamSchema } from './commonSchemas.js';

// ============================================================================
// Create Portfolio
// ============================================================================

export const createPortfolioSchema = z.object({
  portfolioName: z.string().min(1, 'Portfolio name required'),
  description: z.string().optional(),
  benchmarkTicker: z.string().optional(),
});

// ============================================================================
// Add Position
// ============================================================================

export const addPositionSchema = z.object({
  ticker: z.string().min(1, 'Ticker required'),
  assetClass: z.enum(['equity', 'fixed_income', 'commodity', 'cash', 'other']),
  quantity: positiveAmountSchema,
  purchasePrice: nonNegativeAmountSchema,
  purchaseDate: isoDateSchema,
  currentPrice: nonNegativeAmountSchema.optional(),
});

// ============================================================================
// Record Performance
// ============================================================================

export const recordPerformanceSchema = z.object({
  periodLabel: z.string().min(1),
  periodReturn: z.number(),
  benchmarkReturn: z.number().optional(),
  volatility: z.number().optional(),
  sharpeRatio: z.number().optional(),
  maxDrawdown: z.number().optional(),
});

// ============================================================================
// Calculate Metrics
// ============================================================================

export const calculateRiskMetricsSchema = z.object({
  returns: z.array(z.number()).min(1, 'Returns required'),
  riskFreeRate: z.number().optional(),
  benchmarkReturns: z.array(z.number()).optional(),
});

// ============================================================================
// Agentic Routes
// ============================================================================

export const suggestAllocationSchema = z.object({
  riskProfile: z.enum(['conservative', 'moderate', 'aggressive']),
  investmentHorizon: z.number().positive().optional(),
  currentAllocation: z.array(z.object({
    assetClass: z.string(),
    weight: z.number(),
  })).optional(),
});

export const recommendRebalancingSchema = z.object({
  targetAllocation: z.array(z.object({
    assetClass: z.string(),
    targetWeight: z.number(),
  })),
  currentPositions: z.array(z.object({
    ticker: z.string(),
    assetClass: z.string(),
    value: z.number(),
  })),
});

export const generateRiskNarrativeSchema = z.object({
  sharpeRatio: z.number(),
  sortinoRatio: z.number().optional(),
  maxDrawdown: z.number(),
  volatility: z.number(),
});

export const generateAttributionNarrativeSchema = z.object({
  attribution: z.object({
    allocation: z.number(),
    selection: z.number(),
    interaction: z.number(),
    total: z.number(),
  }),
});

// ============================================================================
// Export param schemas
// ============================================================================

export const portfolioIdParamSchema = idParamSchema;
export const positionIdParamSchema = idParamSchema;
