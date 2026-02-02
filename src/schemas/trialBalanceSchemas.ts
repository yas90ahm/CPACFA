/**
 * Zod schemas for trial balance API routes.
 */

import { z } from 'zod';
import { isoDateSchema } from './commonSchemas.js';

// ============================================================================
// Trial Balance Entry
// ============================================================================

export const trialBalanceEntrySchema = z.object({
  accountName: z.string().min(1, 'Account name required'),
  debit: z.number().nonnegative(),
  credit: z.number().nonnegative(),
  accountCode: z.string().optional(),
});

// ============================================================================
// Statements (JSON endpoint)
// ============================================================================

export const accountingStandardSchema = z.enum(['ASPE', 'IFRS', 'FRS102', 'US_GAAP']);

export const transactionSchema = z.object({
  date: z.string().optional(),
  amount: z.number(),
  description: z.string().optional(),
  counterparty: z.string().optional(),
  debit: z.number().optional(),
  credit: z.number().optional(),
});

export const statementsBodySchema = z.object({
  entries: z.array(trialBalanceEntrySchema).min(1, 'At least one trial balance entry required'),
  prior_entries: z.array(trialBalanceEntrySchema).optional(),
  standard: accountingStandardSchema.optional(),
  fullSet: z.boolean().optional(),
  /** When true with fullSet, prior_entries are required for cash flow and equity roll-forward. */
  comparative: z.boolean().optional(),
  country: z.string().optional(),
  jurisdiction: z.string().optional(),
  currency: z.string().optional(),
  taxId: z.string().optional(),
  businessNumber: z.string().optional(),
  entityId: z.string().optional(),
  transactions: z.string().optional(), // JSON string of transactions
  periodLabel: z.string().optional(),
});

// Note: The /ingest endpoint uses multer for file upload, so body validation is different
// Metadata can be validated separately after multipart parsing
export const ingestMetadataSchema = z.object({
  standard: accountingStandardSchema.optional(),
  fullSet: z.string().optional(), // Will be parsed as boolean
  /** When true with fullSet, prior_entries are required for cash flow and equity roll-forward. */
  comparative: z.string().optional(), // Will be parsed as boolean
  country: z.string().optional(),
  jurisdiction: z.string().optional(),
  currency: z.string().optional(),
  taxId: z.string().optional(),
  businessNumber: z.string().optional(),
  entityId: z.string().optional(),
  transactions: z.string().optional(),
  periodLabel: z.string().optional(),
});
