/**
 * Zod schemas for fixed asset API routes (PP&E, depreciation).
 */

import { z } from 'zod';
import { isoDateSchema, amountSchema, idParamSchema } from './commonSchemas.js';

export const depreciationMethodSchema = z.enum([
  'straight_line',
  'declining_balance',
  'units_of_production',
]);

export const createFixedAssetSchema = z.object({
  assetNumber: z.string().min(1, 'Asset number required'),
  description: z.string().optional(),
  assetType: z.string().min(1, 'Asset type required'),
  acquisitionDate: isoDateSchema,
  cost: amountSchema,
  usefulLifeYears: z.number().positive('Useful life required'),
  residualValue: z.number().min(0).optional(),
  method: depreciationMethodSchema,
  depreciationStartDate: isoDateSchema,
  disposedDate: isoDateSchema.optional(),
});

export const updateFixedAssetSchema = z.object({
  assetNumber: z.string().min(1).optional(),
  description: z.string().optional(),
  assetType: z.string().min(1).optional(),
  acquisitionDate: isoDateSchema.optional(),
  cost: amountSchema.optional(),
  usefulLifeYears: z.number().positive().optional(),
  residualValue: z.number().min(0).optional(),
  method: depreciationMethodSchema.optional(),
  depreciationStartDate: isoDateSchema.optional(),
  disposedDate: isoDateSchema.optional().nullable(),
});

export const periodQuerySchema = z.object({
  periodLabel: z.string().min(1, 'Period label required'),
});

export const runDepreciationSchema = z.object({
  periodLabel: z.string().min(1, 'Period label required'),
  periodStart: isoDateSchema,
  periodEnd: isoDateSchema,
});

export const suggestUsefulLifeSchema = z.object({
  assetType: z.string().min(1, 'Asset type required'),
  industry: z.string().optional(),
});

export const suggestMethodSchema = z.object({
  assetType: z.string().min(1, 'Asset type required'),
  usagePattern: z.string().optional(),
});

export const generateFootnoteSchema = z.object({
  periodLabel: z.string().optional(),
  totalDepreciation: amountSchema,
  byType: z.record(z.number()).optional(),
  assetCount: z.number().optional(),
});

export const fixedAssetIdParamSchema = idParamSchema;
