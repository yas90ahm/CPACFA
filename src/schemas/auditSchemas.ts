/**
 * Zod schemas for audit API routes (DRL, PBC, sampling).
 */

import { z } from 'zod';
import { isoDateSchema, amountSchema, idParamSchema } from './commonSchemas.js';

// ============================================================================
// Create DRL
// ============================================================================

export const createDRLSchema = z.object({
  periodLabel: z.string().min(1, 'Period label required'),
  accountName: z.string().min(1, 'Account name required'),
  variance: amountSchema,
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  assignee: z.string().optional(),
  dueDate: isoDateSchema.optional(),
});

// ============================================================================
// Update DRL
// ============================================================================

export const updateDRLSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  resolution: z.string().optional(),
  notes: z.string().optional(),
});

// ============================================================================
// Create PBC Request
// ============================================================================

export const createPBCSchema = z.object({
  periodLabel: z.string().min(1),
  category: z.enum(['financial_statements', 'contracts', 'confirmations', 'reconciliations', 'tax_returns', 'other']),
  description: z.string().min(1, 'Description required'),
  dueDate: isoDateSchema.optional(),
  assignee: z.string().optional(),
});

// ============================================================================
// Update PBC
// ============================================================================

export const updatePBCSchema = z.object({
  status: z.enum(['requested', 'in_progress', 'received', 'reviewed']).optional(),
  notes: z.string().optional(),
});

// ============================================================================
// Create Sampling Plan
// ============================================================================

export const createSamplingPlanSchema = z.object({
  populationName: z.string().min(1, 'Population name required'),
  populationSize: z.number().int().positive('Population size must be positive'),
  samplingMethod: z.enum(['random', 'systematic', 'stratified', 'haphazard']),
  confidenceLevel: z.number().min(0).max(1).optional(),
  tolerableError: z.number().nonnegative().optional(),
});

// ============================================================================
// Perform Sampling
// ============================================================================

export const performSamplingSchema = z.object({
  sampleSize: z.number().int().positive().optional(),
  stratificationCriteria: z.string().optional(),
});

// ============================================================================
// Export param schemas
// ============================================================================

export const drlIdParamSchema = idParamSchema;
export const pbcIdParamSchema = idParamSchema;
export const samplingPlanIdParamSchema = idParamSchema;
