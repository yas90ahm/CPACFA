/**
 * Zod schemas for orchestrator API routes (prepare-q4, intent, lead-partner).
 */

import { z } from 'zod';

// ============================================================================
// Raw trial balance row (from parser)
// ============================================================================

const rawTrialBalanceRowSchema = z.object({
  accountCode: z.string().optional(),
  accountName: z.string(),
  debit: z.number().finite(),
  credit: z.number().finite(),
});

const trialBalanceEntrySchema = z.object({
  accountCode: z.string().optional(),
  accountName: z.string(),
  debit: z.number().finite(),
  credit: z.number().finite(),
}).passthrough();

// ============================================================================
// POST /prepare-q4
// ============================================================================

export const prepareQ4BodySchema = z.object({
  rawRows: z.array(rawTrialBalanceRowSchema).optional(),
  entries: z.array(trialBalanceEntrySchema).optional(),
  bankStatementBalance: z.number().finite().optional(),
  periodLabel: z.string().optional(),
});

// ============================================================================
// POST /intent
// ============================================================================

export const intentBodySchema = z.object({
  query: z.string().optional(),
});

// ============================================================================
// POST /lead-partner — query required; rest optional (BS/P&L/DCF passed through)
// ============================================================================

export const leadPartnerBodySchema = z.object({
  query: z.string().min(1, 'query required'),
  rawRows: z.array(rawTrialBalanceRowSchema).optional(),
  entries: z.array(trialBalanceEntrySchema).optional(),
  bankStatementBalance: z.number().finite().optional(),
  periodLabel: z.string().optional(),
  balanceSheet: z.record(z.unknown()).optional(),
  profitAndLoss: z.record(z.unknown()).optional(),
  dcfInputs: z.record(z.unknown()).optional(),
  cfoView: z.record(z.unknown()).optional(),
}).passthrough();
