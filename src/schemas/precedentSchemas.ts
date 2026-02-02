/**
 * Zod schemas for precedent transactions API routes.
 */

import { z } from 'zod';
import { isoDateSchema, positiveAmountSchema, idParamSchema } from './commonSchemas.js';

// ============================================================================
// Create Transaction
// ============================================================================

export const createTransactionSchema = z.object({
  transactionName: z.string().min(1, 'Transaction name required'),
  targetCompany: z.string().min(1, 'Target company required'),
  acquirerCompany: z.string().min(1, 'Acquirer company required'),
  announcementDate: isoDateSchema,
  closingDate: z.string().optional(),
  dealValue: positiveAmountSchema.optional(),
  evRevenue: z.number().optional(),
  evEbitda: z.number().optional(),
  premiumPaid: z.number().optional(),
  paymentStructure: z.string().optional(),
  rationale: z.string().optional(),
  notes: z.string().optional(),
});

// ============================================================================
// Calculate Valuation
// ============================================================================

export const calculatePrecedentValuationSchema = z.object({
  targetMetrics: z.object({
    revenue: positiveAmountSchema.optional(),
    ebitda: positiveAmountSchema.optional(),
  }),
  method: z.enum(['median', 'mean', 'weighted']).optional(),
});

// ============================================================================
// Agentic Routes
// ============================================================================

export const suggestPrecedentsSchema = z.object({
  targetCompany: z.string().min(1, 'Target company required'),
  industry: z.string().min(1, 'Industry required'),
  dealSizeRange: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
  }).optional(),
  timeframe: z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  }).optional(),
});

export const estimateSynergiesSchema = z.object({
  targetCompany: z.string().min(1),
  acquirerCompany: z.string().min(1),
  targetRevenue: positiveAmountSchema,
  acquirerRevenue: positiveAmountSchema.optional(),
});

export const generateMemoSchema = z.object({
  transaction: z.object({
    transactionName: z.string(),
    targetCompany: z.string(),
    acquirerCompany: z.string(),
    dealValue: z.number().optional(),
  }),
});

// ============================================================================
// Export param schemas
// ============================================================================

export const transactionIdParamSchema = idParamSchema;
