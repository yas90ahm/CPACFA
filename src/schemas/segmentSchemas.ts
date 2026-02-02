/**
 * Zod schemas for segment reporting API routes (IFRS 8 / ASC 280).
 */

import { z } from 'zod';
import { amountSchema, percentageSchema, idParamSchema } from './commonSchemas.js';

// ============================================================================
// Create Segment
// ============================================================================

export const createSegmentSchema = z.object({
  segmentName: z.string().min(1, 'Segment name required'),
  description: z.string().optional(),
  isOperating: z.boolean().optional(),
});

// ============================================================================
// Record Performance
// ============================================================================

export const recordSegmentPerformanceSchema = z.object({
  periodLabel: z.string().min(1, 'Period label required'),
  revenue: amountSchema,
  operatingIncome: amountSchema.optional(),
  assets: amountSchema.optional(),
  liabilities: amountSchema.optional(),
});

// ============================================================================
// Intersegment Eliminations
// ============================================================================

export const addEliminationSchema = z.object({
  fromSegmentId: z.string().min(1),
  toSegmentId: z.string().min(1),
  periodLabel: z.string().min(1),
  amount: amountSchema,
  description: z.string().optional(),
});

// ============================================================================
// Reconciliation
// ============================================================================

export const reconcileToConsolidatedSchema = z.object({
  periodLabel: z.string().min(1),
  consolidatedRevenue: amountSchema,
  consolidatedIncome: amountSchema.optional(),
});

// ============================================================================
// Agentic Routes
// ============================================================================

export const identifySegmentsSchema = z.object({
  businessDescription: z.string().min(1, 'Business description required'),
  organizationalStructure: z.string().optional(),
});

export const assessReportabilitySchema = z.object({
  segmentRevenue: amountSchema,
  totalRevenue: amountSchema,
  segmentAssets: amountSchema.optional(),
  totalAssets: amountSchema.optional(),
  segmentIncome: amountSchema.optional(),
  totalIncome: amountSchema.optional(),
});

export const generateSegmentFootnoteSchema = z.object({
  segments: z.array(z.object({
    segmentName: z.string(),
    revenue: z.number(),
    operatingIncome: z.number().optional(),
  })),
  consolidatedRevenue: amountSchema,
});

// ============================================================================
// Export param schemas
// ============================================================================

export const segmentIdParamSchema = idParamSchema;
