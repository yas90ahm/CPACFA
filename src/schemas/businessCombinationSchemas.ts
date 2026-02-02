/**
 * Zod schemas for business combinations API routes (ASC 805 / IFRS 3).
 */

import { z } from 'zod';
import { isoDateSchema, positiveAmountSchema, nonNegativeAmountSchema, idParamSchema } from './commonSchemas.js';

// ============================================================================
// Create Acquisition
// ============================================================================

export const createAcquisitionSchema = z.object({
  acquireeName: z.string().min(1, 'Acquiree name required'),
  acquisitionDate: isoDateSchema,
  purchasePrice: positiveAmountSchema,
  cashPaid: nonNegativeAmountSchema.optional(),
  stockIssued: nonNegativeAmountSchema.optional(),
  contingentConsideration: nonNegativeAmountSchema.optional(),
  notes: z.string().optional(),
});

// ============================================================================
// Update Acquisition
// ============================================================================

export const updateAcquisitionSchema = createAcquisitionSchema.partial();

// ============================================================================
// PPA Line Item
// ============================================================================

export const addPPALineItemSchema = z.object({
  itemType: z.enum(['asset', 'liability', 'intangible', 'goodwill']),
  description: z.string().min(1, 'Description required'),
  fairValue: z.number().finite('Fair value must be finite'),
  usefulLife: z.number().int().positive().optional(),
  notes: z.string().optional(),
});

export const updatePPALineItemSchema = addPPALineItemSchema.partial();

// ============================================================================
// Calculate PPA
// ============================================================================

export const calculatePPASchema = z.object({
  acquisitionId: z.string().min(1, 'Acquisition ID required'),
});

// ============================================================================
// Contingent Consideration
// ============================================================================

export const addContingentConsiderationSchema = z.object({
  description: z.string().min(1, 'Description required'),
  baseAmount: nonNegativeAmountSchema,
  maxAmount: positiveAmountSchema.optional(),
  contingency: z.string().min(1, 'Contingency details required'),
  estimatedFairValue: nonNegativeAmountSchema.optional(),
  measurementDate: isoDateSchema.optional(),
  notes: z.string().optional(),
});

// ============================================================================
// Agentic Routes
// ============================================================================

export const identifyIntangiblesSchema = z.object({
  acquireeBusiness: z.string().min(1, 'Acquiree business description required'),
  industry: z.string().optional(),
  revenueModel: z.string().optional(),
});

export const valueEarnOutSchema = z.object({
  earnOutTerms: z.string().min(1, 'Earn-out terms required'),
  historicalPerformance: z.record(z.unknown()).optional(),
  projectedPerformance: z.record(z.unknown()).optional(),
});

export const generatePPAFootnoteSchema = z.object({
  ppaResult: z.object({
    purchasePrice: z.number(),
    netAssetsAcquired: z.number(),
    goodwill: z.number().optional(),
    bargainPurchaseGain: z.number().optional(),
  }),
  lineItems: z.array(z.object({
    description: z.string(),
    fairValue: z.number(),
  })).optional(),
});

// ============================================================================
// Export param schemas
// ============================================================================

export const acquisitionIdParamSchema = idParamSchema;
export const ppaLineItemIdParamSchema = idParamSchema;
