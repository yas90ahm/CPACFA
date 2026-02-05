/**
 * Zod schemas for catalog routes. Ensures no route mutates state using raw req.body.
 */

import { z } from 'zod';

const dataCatalogDatasetTypeSchema = z.enum([
  'trial_balance',
  'balance_sheet',
  'profit_and_loss',
  'budget_version',
  'cash_forecast',
  'ar_aging',
  'ap_aging',
  'data_quality_exceptions',
]);

const schemaFieldSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
});

/** POST /api/catalog/query */
export const catalogQueryBodySchema = z.object({
  datasetId: z.string().min(1, 'datasetId required'),
  periodLabel: z.string().optional(),
  entityId: z.string().optional(),
  limit: z.number().int().positive().max(10_000).optional(),
});

/** POST /api/catalog/datasets */
export const catalogCreateDatasetBodySchema = z.object({
  name: z.string().min(1, 'name required').max(500),
  type: dataCatalogDatasetTypeSchema,
  schema: z.array(schemaFieldSchema).optional(),
});

/** PATCH /api/catalog/datasets/:id */
export const catalogUpdateDatasetBodySchema = z.object({
  name: z.string().min(1).max(500).optional(),
  type: dataCatalogDatasetTypeSchema.optional(),
  schema: z.array(schemaFieldSchema).optional(),
});

/** POST /api/catalog/resolve-intent */
export const catalogResolveIntentBodySchema = z.object({
  question: z.string().optional(),
});

export type CatalogQueryBody = z.infer<typeof catalogQueryBodySchema>;
export type CatalogCreateDatasetBody = z.infer<typeof catalogCreateDatasetBodySchema>;
export type CatalogUpdateDatasetBody = z.infer<typeof catalogUpdateDatasetBodySchema>;
export type CatalogResolveIntentBody = z.infer<typeof catalogResolveIntentBodySchema>;
