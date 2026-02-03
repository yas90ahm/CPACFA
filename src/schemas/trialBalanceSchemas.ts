/**
 * Zod schemas for trial balance API routes.
 * All POST/PUT bodies must be validated via validationMiddleware with these schemas.
 */

import { z } from 'zod';

// ============================================================================
// Trial Balance Entry (accepts number or string for debit/credit from JSON/form)
// ============================================================================

export const trialBalanceEntrySchema = z.object({
  accountName: z.string().min(1, 'Account name required'),
  debit: z.coerce.number().nonnegative('Debit must be non-negative'),
  credit: z.coerce.number().nonnegative('Credit must be non-negative'),
  accountCode: z.string().optional(),
});

// ============================================================================
// Accounting Standard
// ============================================================================

export const accountingStandardSchema = z.enum(['ASPE', 'IFRS', 'FRS102', 'US_GAAP']);

// ============================================================================
// Statements (POST /statements)
// ============================================================================

export const transactionSchema = z.object({
  date: z.string().optional(),
  amount: z.coerce.number(),
  description: z.string().optional(),
  counterparty: z.string().optional(),
  debit: z.coerce.number().optional(),
  credit: z.coerce.number().optional(),
});

export const statementsBodySchema = z
  .object({
    entries: z.array(trialBalanceEntrySchema).min(1, 'At least one trial balance entry required'),
    prior_entries: z.array(trialBalanceEntrySchema).optional(),
    standard: accountingStandardSchema.optional(),
    fullSet: z.boolean().optional(),
    comparative: z.boolean().optional(),
    country: z.string().optional(),
    jurisdiction: z.string().optional(),
    currency: z.string().optional(),
    taxId: z.string().optional(),
    businessNumber: z.string().optional(),
    entityId: z.string().optional(),
    publiclyAccountable: z.boolean().optional(),
    transactions: z.string().optional(),
    periodLabel: z.string().optional(),
    prior_period_label: z.string().optional(),
    useAgenticClassification: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (data.fullSet && data.comparative) {
        return Array.isArray(data.prior_entries) && data.prior_entries.length > 0;
      }
      return true;
    },
    { message: 'When fullSet and comparative are true, prior_entries is required', path: ['prior_entries'] }
  );

// ============================================================================
// Ingest and classify (re-export from request/trialBalance for backward compatibility)
// ============================================================================

export {
  ingestBodySchema,
  type IngestBody,
  classificationSuggestionsBodySchema,
  type ClassificationSuggestionsBody,
  applyClassificationBodySchema,
  type ApplyClassificationBody,
} from './request/trialBalance.js';

// Legacy alias for ingest metadata only (no prior_entries etc.)
export { ingestBodySchema as ingestMetadataSchema } from './request/trialBalance.js';

// ============================================================================
// Cash Flow Narrative (POST /cash-flow-narrative)
// ============================================================================

const cashFlowSectionLineSchema = z.object({
  label: z.string(),
  amount: z.coerce.number(),
});

export const cashFlowNarrativeBodySchema = z.object({
  cashFlowStatement: z.object({
    operating: z.array(cashFlowSectionLineSchema).min(1, 'At least one operating line required'),
    investing: z.array(cashFlowSectionLineSchema).optional(),
    financing: z.array(cashFlowSectionLineSchema).optional(),
    netChangeInCash: z.coerce.number().optional(),
    beginningCash: z.coerce.number().optional(),
    endingCash: z.coerce.number().optional(),
  }),
  periodLabel: z.string().optional(),
});

// ============================================================================
// Notes Narrative (POST /notes-narrative)
// ============================================================================

export const notesNarrativeBodySchema = z.object({
  standard: accountingStandardSchema,
  context: z.string().optional(),
});

// ============================================================================
// Confirm Standard (POST /confirm-standard)
// ============================================================================

export const confirmStandardBodySchema = z.object({
  entityId: z.string().min(1, 'entityId is required'),
  standard: accountingStandardSchema,
  fiscalYear: z.string().optional(),
});

// ============================================================================
// Equity Changes Narrative (POST /equity-changes-narrative)
// ============================================================================

export const equityChangesNarrativeBodySchema = z.object({
  equityChangesStatement: z.record(z.string(), z.unknown()),
});

// ============================================================================
// Period routes (GET /period/:periodLabel, /period/:periodLabel/adjusted, /period/:periodLabel/statements)
// ============================================================================

export const periodLabelParamSchema = z.object({
  periodLabel: z.string().min(1, 'periodLabel required'),
});

export const periodStatementsQuerySchema = z.object({
  standard: z.string().optional(),
  fullSet: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((v) => (v === false || v === 'false' ? false : true)),
});

// ============================================================================
// Inferred types for route handlers
// ============================================================================

export type StatementsBody = z.infer<typeof statementsBodySchema>;
export type CashFlowNarrativeBody = z.infer<typeof cashFlowNarrativeBodySchema>;
export type NotesNarrativeBody = z.infer<typeof notesNarrativeBodySchema>;
export type ConfirmStandardBody = z.infer<typeof confirmStandardBodySchema>;
export type EquityChangesNarrativeBody = z.infer<typeof equityChangesNarrativeBodySchema>;
