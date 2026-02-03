/**
 * Zod schemas for revenue recognition API routes (ASC 606 / IFRS 15).
 */

import { z } from 'zod';
import { isoDateSchema, positiveAmountSchema, amountSchema, idParamSchema } from './commonSchemas.js';

// ============================================================================
// Create Contract (POST /contracts — contractNumber, startDate, endDate, performanceObligations)
// ============================================================================

const scheduleTypeSchema = z.enum(['linear', 'cost_to_cost', 'milestones', 'custom']).optional();

const performanceObligationInputSchema = z.object({
  name: z.string().min(1, 'POB name required'),
  description: z.string().optional(),
  satisfiedOverTime: z.boolean(),
  allocationPercent: z.number().finite().optional(),
  allocationAmount: z.number().finite().optional(),
  scheduleType: scheduleTypeSchema,
  costToCostTotalEstimated: z.number().finite().optional(),
  costToCostCostsToDate: z.number().finite().optional(),
  milestoneAmounts: z.array(z.object({ date: z.string(), amount: z.number().finite() })).optional(),
});

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

/** Body for POST /contracts — matches createContract service input */
export const createContractBodySchema = z.object({
  contractNumber: z.string().min(1, 'contractNumber required'),
  customerId: z.string().optional(),
  customerName: z.string().optional(),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  totalContractValue: positiveAmountSchema,
  currency: z.string().min(1, 'currency required'),
  performanceObligations: z.array(performanceObligationInputSchema).min(1, 'At least one performance obligation required'),
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
// PUT /contracts/:id/allocation — Set allocation
// ============================================================================

export const setAllocationBodySchema = z.object({
  allocation: z.record(z.number().finite()).refine((o) => typeof o === 'object' && o !== null && Object.keys(o).length > 0, 'allocation must be a non-empty object of pob-id to amount'),
  allocationRationale: z.string().optional(),
});

// ============================================================================
// POST /footnote — Generate revenue footnote
// ============================================================================

export const revenueFootnoteBodySchema = z.object({
  contractCount: z.number().int().nonnegative(),
  totalContractValue: z.number().finite(),
  currency: z.string().min(1),
  periodLabel: z.string().optional(),
  accountingStandard: z.enum(['ASPE', 'IFRS', 'FRS102', 'US_GAAP']).optional(),
});

// ============================================================================
// Export param schemas
// ============================================================================

export const contractIdParamSchema = idParamSchema;
export const obligationIdParamSchema = idParamSchema;

export const contractIdPobIdParamsSchema = z.object({
  contractId: z.string().min(1, 'Contract ID required'),
  pobId: z.string().min(1, 'POB ID required'),
});
