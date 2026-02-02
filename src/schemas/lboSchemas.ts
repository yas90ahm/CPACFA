import { z } from 'zod';
import { amountSchema, idParamSchema } from './commonSchemas.js';

export const createLboModelSchema = z.object({
  name: z.string().min(1),
  targetName: z.string().optional(),
  entryEv: amountSchema.optional(),
  entryMultipleMetric: z.string().optional(),
  entryMultiple: amountSchema.optional(),
  exitYear: z.number().int().positive().optional(),
  exitMultiple: amountSchema.optional(),
  debtAmount: amountSchema.optional(),
  equityAmount: amountSchema.optional(),
  irr: amountSchema.optional(),
  moic: amountSchema.optional(),
  assumptions: z.record(z.unknown()).optional(),
});

export const updateLboModelSchema = createLboModelSchema.partial();

export const calculateLboSchema = z.object({
  acquisitionPrice: amountSchema,
  feesPct: z.number().min(0).max(1).optional(),
  existingDebt: amountSchema.optional(),
  cash: amountSchema.optional(),
  rate: z.number().optional(),
  initialEbitda: amountSchema,
  fcfMarginPct: z.number().min(0).max(1),
  growthRate: z.number(),
  exitYear: z.number().int().positive(),
  exitMultiple: amountSchema,
  entryEv: amountSchema.optional(),
  save: z.boolean().optional(),
  modelId: z.string().optional(),
});

export const suggestExitMultipleSchema = z.object({
  industry: z.string().min(1),
  growth: z.number().optional(),
  margins: z.number().optional(),
});

export const suggestDebtCapacitySchema = z.object({
  ebitda: amountSchema,
  industry: z.string().min(1),
});

export const lboIdParamSchema = idParamSchema;
