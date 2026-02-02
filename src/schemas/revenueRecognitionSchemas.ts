/**
 * Zod schemas for revenue recognition API routes (ASC 606 / IFRS 15).
 */

import { z } from 'zod';
import { isoDateSchema, positiveAmountSchema, amountSchema, idParamSchema } from './commonSchemas.js';

// ============================================================================
// Create Contract
// ============================================================================

export const createContractSchema = z.object({
  customerName: z.string().min(1, 'Customer name required'),
  contractDate: isoDateSchema,
  totalContractValue: positiveAmountSchema,
  performanceObligations: z.array(z.object({
    description: z.string().min(1),
    standalonePricing: z.number().optional(),
    allocatedAmount: z.number().optional(),
  })).optional(),
  paymentTerms: z.string().optional(),
  notes: z.string().optional(),
});

// ============================================================================
// Allocate Transaction Price
// ============================================================================

export const allocateTransactionPriceSchema = z.object({
  performanceObligations: z.array(z.object({
    description: z.string(),
    standalonePricing: positiveAmountSchema,
  })).min(1, 'At least one performance obligation required'),
});

// ============================================================================
// Recognize Revenue
// ============================================================================

export const recognizeRevenueSchema = z.object({
  periodLabel: z.string().min(1),
  percentComplete: z.number().min(0).max(1).optional(),
  milestonesAchieved: z.array(z.string()).optional(),
});

// ============================================================================
// Agentic Routes
// ============================================================================

export const identifyPerformanceObligationsSchema = z.object({
  contractText: z.string().min(1, 'Contract text required'),
});

export const suggestAllocationSchema = z.object({
  totalPrice: positiveAmountSchema,
  performanceObligations: z.array(z.object({
    description: z.string(),
    standalonePricing: z.number().optional(),
  })).min(1),
});

export const determineRecognitionTimingSchema = z.object({
  performanceObligation: z.string().min(1),
  deliveryTerms: z.string().optional(),
});

// ============================================================================
// Export param schemas
// ============================================================================

export const contractIdParamSchema = idParamSchema;
export const obligationIdParamSchema = idParamSchema;
