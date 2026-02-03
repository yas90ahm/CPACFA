/**
 * Zod schemas for onboarding API routes (advance, entity-info, coa-import, suggest-coa-mapping, first-close-guide).
 */

import { z } from 'zod';

// ============================================================================
// POST /advance
// ============================================================================

export const advanceStepBodySchema = z.object({
  stepId: z.string().min(1, 'stepId required'),
});

// ============================================================================
// POST /entity-info
// ============================================================================

export const entityInfoBodySchema = z.object({
  entityName: z.string().optional(),
  fiscalYearEnd: z.string().optional(),
  currency: z.string().optional(),
});

// ============================================================================
// POST /coa-import — accounts: [{ code, name }]
// ============================================================================

const coaAccountSchema = z.object({
  code: z.string(),
  name: z.string(),
});

export const coaImportBodySchema = z.object({
  accounts: z.array(coaAccountSchema).min(1, 'accounts array required ( [{ code, name }] )'),
});

// ============================================================================
// POST /suggest-coa-mapping
// ============================================================================

export const suggestCoAMappingBodySchema = z.object({
  accounts: z.array(coaAccountSchema).min(1, 'accounts array required ( [{ code, name }] )'),
});

// ============================================================================
// POST /first-close-guide
// ============================================================================

export const firstCloseGuideBodySchema = z.object({
  entityName: z.string().optional(),
  fiscalYearEnd: z.string().optional(),
});
