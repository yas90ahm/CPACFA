/**
 * Zod schemas for comparable analysis API routes.
 */

import { z } from 'zod';
import { positiveAmountSchema, idParamSchema } from './commonSchemas.js';

// ============================================================================
// Create Comparable Set
// ============================================================================

export const createComparableSetSchema = z.object({
  setName: z.string().min(1, 'Set name required'),
  targetCompany: z.string().min(1, 'Target company required'),
  industry: z.string().optional(),
});

// ============================================================================
// Add Comparable
// ============================================================================

export const addComparableSchema = z.object({
  companyName: z.string().min(1, 'Company name required'),
  ticker: z.string().optional(),
  marketCap: positiveAmountSchema.optional(),
  evRevenue: z.number().optional(),
  evEbitda: z.number().optional(),
  priceEarnings: z.number().optional(),
  priceBook: z.number().optional(),
  priceRevenue: z.number().optional(),
  debtEquity: z.number().optional(),
  roa: z.number().optional(),
  roe: z.number().optional(),
  revenueGrowth: z.number().optional(),
  notes: z.string().optional(),
});

// ============================================================================
// Calculate Valuation
// ============================================================================

export const calculateValuationSchema = z.object({
  targetMetrics: z.object({
    revenue: positiveAmountSchema.optional(),
    ebitda: positiveAmountSchema.optional(),
    earnings: z.number().optional(),
    bookValue: z.number().optional(),
  }),
  method: z.enum(['median', 'mean', 'weighted']).optional(),
});

// ============================================================================
// Agentic Routes
// ============================================================================

export const selectPeersSchema = z.object({
  targetCompany: z.string().min(1, 'Target company required'),
  industry: z.string().min(1, 'Industry required'),
  marketCapRange: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
  }).optional(),
});

export const suggestAdjustmentsSchema = z.object({
  comparable: z.object({
    companyName: z.string(),
    evEbitda: z.number().optional(),
    priceEarnings: z.number().optional(),
  }),
  targetCompany: z.string(),
});

export const generateCompsMemohema = z.object({
  setName: z.string(),
  targetCompany: z.string(),
  comparables: z.array(z.object({
    companyName: z.string(),
    evRevenue: z.number().optional(),
    evEbitda: z.number().optional(),
  })),
  valuation: z.object({
    impliedValue: z.number(),
    impliedPerShare: z.number().optional(),
  }).optional(),
});

// ============================================================================
// Export param schemas
// ============================================================================

export const setIdParamSchema = idParamSchema;
export const comparableIdParamSchema = idParamSchema;
