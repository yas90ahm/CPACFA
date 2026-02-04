/**
 * Request validation schemas for trial balance routes (ingest and classify).
 * Used by validationMiddleware; re-exported from trialBalanceSchemas for backward compatibility.
 */

import { z } from 'zod';

// ============================================================================
// Shared primitives (minimal copies to avoid circular dependency with trialBalanceSchemas)
// ============================================================================

export const trialBalanceEntrySchema = z.object({
  accountName: z.string().min(1, 'Account name required'),
  debit: z.coerce.number().nonnegative('Debit must be non-negative'),
  credit: z.coerce.number().nonnegative('Credit must be non-negative'),
  accountCode: z.string().optional(),
});

export const accountingStandardSchema = z.enum(['ASPE', 'IFRS', 'FRS102', 'US_GAAP']);

// ============================================================================
// Ingest (POST /ingest) — multer parses multipart; fields may be strings
// ============================================================================

const optionalBooleanOrString = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .optional()
  .transform((v) => (v === true || v === 'true' || v === '1' ? true : v === false || v === 'false' || v === '0' ? false : undefined));

export const ingestBodySchema = z.object({
  tenantId: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),
  standard: accountingStandardSchema.optional(),
  fullSet: optionalBooleanOrString,
  comparative: optionalBooleanOrString,
  country: z.string().optional(),
  jurisdiction: z.string().optional(),
  currency: z.string().optional(),
  taxId: z.string().optional(),
  businessNumber: z.string().optional(),
  entityId: z.string().optional(),
  publiclyAccountable: optionalBooleanOrString,
  prior_entries: z.union([z.array(trialBalanceEntrySchema), z.string()]).optional(),
  transactions: z.string().optional(),
  periodLabel: z.string().optional(),
  prior_period_label: z.string().optional(),
  useAgenticClassification: optionalBooleanOrString,
  contractText: z.union([z.string(), z.array(z.string())]).optional(),
  leaseDocuments: z.union([z.string(), z.array(z.string())]).optional(),
  allowImbalance: optionalBooleanOrString,
});

export type IngestBody = z.infer<typeof ingestBodySchema>;

// ============================================================================
// Classification Suggestions (POST /classification-suggestions)
// ============================================================================

export const classificationSuggestionsBodySchema = z.object({
  entries: z
    .array(
      z.object({
        accountName: z.string(),
        debit: z.coerce.number(),
        credit: z.coerce.number(),
      })
    )
    .min(1, 'At least one entry required'),
});

export type ClassificationSuggestionsBody = z.infer<typeof classificationSuggestionsBodySchema>;

// ============================================================================
// Apply Classification (POST /apply-classification)
// ============================================================================

const accountTypeSchema = z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']);

export const applyClassificationBodySchema = z.object({
  entries: z
    .array(
      z.object({
        accountName: z.string(),
        debit: z.coerce.number(),
        credit: z.coerce.number(),
      })
    )
    .min(1, 'At least one entry required'),
  overrides: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        accountType: accountTypeSchema,
        rationale: z.string().optional(),
      })
    )
    .optional()
    .default([]),
});

export type ApplyClassificationBody = z.infer<typeof applyClassificationBodySchema>;
