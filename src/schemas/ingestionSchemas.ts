/**
 * Zod schemas for ingestion API routes (agent, pipeline, fetchers).
 * Form fields from multipart are strings; schemas accept and coerce them.
 */

import { z } from 'zod';

// ============================================================================
// POST /agent — multipart body fields (after multer; file checked in handler)
// ============================================================================

const dataCleaningSchema = z.object({
  normalizeNegativeNumbers: z.union([z.boolean(), z.string()]).optional(),
  normalizeDates: z.union([z.boolean(), z.string()]).optional(),
  dateOutputFormat: z.enum(['us', 'uk', 'iso']).optional(),
}).strict().optional();

export const ingestionAgentBodySchema = z.object({
  dataCleaning: dataCleaningSchema,
  includeRows: z.union([z.boolean(), z.enum(['true', 'false', '1', '0'])]).optional(),
  rowLimit: z.union([z.number(), z.string()]).optional(),
}).passthrough();

// ============================================================================
// POST /fetchers/run — query params
// ============================================================================

export const fetchersRunQuerySchema = z.object({
  tenantId: z.string().optional(),
  mode: z.enum(['fetch', 'ingest']).optional(),
});
