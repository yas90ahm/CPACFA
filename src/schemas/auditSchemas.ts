/**
 * Zod schemas for audit API routes (DRL, PBC, sampling, engagements, professional review, etc.).
 * All POST/PATCH bodies validated via validationMiddleware.
 */

import { z } from 'zod';
import { isoDateSchema, amountSchema, idParamSchema } from './commonSchemas.js';

// ============================================================================
// Param schemas (shared)
// ============================================================================

export const drlIdParamSchema = idParamSchema;
export const pbcIdParamSchema = idParamSchema;
export const samplingPlanIdParamSchema = idParamSchema;

// ============================================================================
// DRL (document request list)
// ============================================================================

export const createDRLBodySchema = z.object({
  requestLabel: z.string().min(1, 'requestLabel required'),
  documentId: z.string().optional(),
  status: z.enum(['pending', 'fulfilled', 'partial']).optional(),
});

export const updateDRLBodySchema = z.object({
  assignee: z.string().optional(),
  dueDate: isoDateSchema.optional(),
  status: z.enum(['pending', 'in_progress', 'fulfilled', 'partial']).optional(),
});

export const fulfillDRLBodySchema = z.object({
  documentId: z.string().min(1, 'documentId required'),
});

// Legacy (different API shape)
export const createDRLSchema = z.object({
  periodLabel: z.string().min(1, 'Period label required'),
  accountName: z.string().min(1, 'Account name required'),
  variance: amountSchema,
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  assignee: z.string().optional(),
  dueDate: isoDateSchema.optional(),
});

export const updateDRLSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  resolution: z.string().optional(),
  notes: z.string().optional(),
});

// ============================================================================
// PBC (provided by client)
// ============================================================================

export const createPBCBodySchema = z.object({
  label: z.string().min(1, 'label required'),
  description: z.string().optional(),
  periodLabel: z.string().optional(),
});

export const updatePBCBodySchema = z.object({
  status: z.enum(['pending', 'provided', 'partial']).optional(),
  providedAt: z.string().optional(),
  documentId: z.string().optional(),
});

export const createPBCSchema = z.object({
  periodLabel: z.string().min(1),
  category: z.enum(['financial_statements', 'contracts', 'confirmations', 'reconciliations', 'tax_returns', 'other']),
  description: z.string().min(1, 'Description required'),
  dueDate: isoDateSchema.optional(),
  assignee: z.string().optional(),
});

export const updatePBCSchema = z.object({
  status: z.enum(['requested', 'in_progress', 'received', 'reviewed']).optional(),
  notes: z.string().optional(),
});

// ============================================================================
// Sampling
// ============================================================================

const samplingItemSchema = z.object({ id: z.string(), amount: z.number().optional() });

export const samplingBodySchema = z.object({
  population: z.string().min(1, 'population required'),
  items: z.array(samplingItemSchema).min(1, 'items required'),
  method: z.enum(['random', 'risk_based', 'hilo']),
  sampleSize: z.number().int().nonnegative(),
  periodLabel: z.string().optional(),
  materialityThreshold: z.number().optional(),
  populationCount: z.number().int().optional(),
});

export const samplingDesignBodySchema = z.object({
  populationSize: z.coerce.number().finite().refine((n) => n >= 0, 'populationSize must be non-negative'),
  risk: z.number().optional(),
  confidenceLevel: z.number().optional(),
  materialityThreshold: z.number().optional(),
  preferRiskBased: z.boolean().optional(),
});

export const samplingTestResultsBodySchema = z.object({
  testResults: z.array(
    z.object({
      id: z.string(),
      result: z.enum(['pass', 'fail', 'exception']),
      note: z.string().optional(),
    })
  ),
});

export const createSamplingPlanSchema = z.object({
  populationName: z.string().min(1, 'Population name required'),
  populationSize: z.number().int().positive('Population size must be positive'),
  samplingMethod: z.enum(['random', 'systematic', 'stratified', 'haphazard']),
  confidenceLevel: z.number().min(0).max(1).optional(),
  tolerableError: z.number().nonnegative().optional(),
});

export const performSamplingSchema = z.object({
  sampleSize: z.number().int().positive().optional(),
  stratificationCriteria: z.string().optional(),
});

// ============================================================================
// Professional review
// ============================================================================

const trialBalanceEntryRefSchema = z.object({
  accountName: z.string(),
  debit: z.coerce.number(),
  credit: z.coerce.number(),
});

export const professionalReviewBodySchema = z.object({
  runId: z.string().min(1, 'runId required'),
  periodLabel: z.string().min(1, 'periodLabel required'),
  trialBalance: z.object({ entries: z.array(trialBalanceEntryRefSchema) }).optional(),
  balanceSheet: z
    .object({
      totalAssets: z.number(),
      totalLiabilities: z.number(),
      totalEquity: z.number(),
    })
    .optional(),
  profitAndLoss: z
    .object({
      totalRevenue: z.number(),
      totalExpenses: z.number(),
      netIncome: z.number(),
    })
    .optional(),
  covenantResult: z.object({ debtToEbitdaBreach: z.boolean().optional(), interestCoverageBreach: z.boolean().optional() }).optional(),
  liquidityMetrics: z.object({ currentRatio: z.number().optional(), runwayMonths: z.number().optional() }).optional(),
  contractIds: z.array(z.string()).optional(),
  contractText: z.union([z.string(), z.array(z.string())]).optional(),
  leaseDocuments: z.union([z.string(), z.array(z.string())]).optional(),
  portfolioIds: z.array(z.string()).optional(),
});

export const integrityValidateBodySchema = z.object({
  entries: z
    .array(
      z.object({
        accountName: z.string(),
        debit: z.coerce.number(),
        credit: z.coerce.number(),
        accountType: z.string().optional(),
      })
    )
    .min(1, 'entries required'),
  contracts: z
    .array(
      z.object({
        id: z.string().optional(),
        totalContractValue: z.number(),
        periodRecognizedRevenue: z.number().optional(),
      })
    )
    .min(1, 'contracts required'),
  tolerance: z.number().optional(),
});

export const professionalReviewFlagUpdateBodySchema = z
  .object({
    status: z.enum(['acknowledged', 'resolved']),
    acknowledgedBy: z.string().optional(),
    resolvedBy: z.string().optional(),
    note: z.string().optional(),
    userRationale: z.string().optional(),
  })
  .refine((data) => (data.note ?? data.userRationale ?? '').trim().length > 0, {
    message: 'note or userRationale required for override (audit ledger)',
    path: ['note'],
  });

// ============================================================================
// Engagements
// ============================================================================

export const createEngagementBodySchema = z.object({
  name: z.string().optional(),
  status: z.string().optional(),
});

export const updateEngagementBodySchema = z.object({
  name: z.string().optional(),
  status: z.string().optional(),
});

export const addPeriodToEngagementBodySchema = z.object({
  periodLabel: z.string().min(1, 'periodLabel required'),
  sortOrder: z.number().int().optional(),
});

// ============================================================================
// Prior period comparison
// ============================================================================

const periodLineSchema = z.object({ label: z.string(), amount: z.number() });

export const priorPeriodComparisonBodySchema = z.object({
  currentPeriodLabel: z.string().min(1, 'currentPeriodLabel required'),
  priorPeriodLabel: z.string().min(1, 'priorPeriodLabel required'),
  currentLines: z.array(periodLineSchema),
  priorLines: z.array(periodLineSchema),
  entityId: z.string().optional(),
});

export const priorPeriodExplainBodySchema = z.object({
  currentPeriodLabel: z.string().min(1),
  priorPeriodLabel: z.string().min(1),
  lines: z.array(
    z.object({
      label: z.string(),
      currentAmount: z.number(),
      priorAmount: z.number(),
      change: z.number(),
      changePercent: z.number(),
      material: z.boolean().optional(),
    })
  ),
});

// ============================================================================
// Auditor
// ============================================================================

export const auditorVerifyBodySchema = z.object({
  token: z.string().optional(),
});

export const internalControlsChatBodySchema = z.object({
  question: z.string().min(1, 'question required'),
  token: z.string().optional(),
});

// ============================================================================
// Todos
// ============================================================================

const gapItemSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  description: z.string(),
  urgency: z.string(),
  suggestion: z.string().optional(),
});

export const todosFromGapsBodySchema = z.object({
  gaps: z.array(gapItemSchema).optional(),
});

export const todoUpdateBodySchema = z.object({
  status: z.enum(['open', 'done']),
});

// ============================================================================
// GAAP / policy
// ============================================================================

export const policyChangeBodySchema = z.object({
  effectiveDate: z.string().min(1, 'effectiveDate required'),
  policyArea: z.string().min(1, 'policyArea required'),
  changeDescription: z.string().min(1, 'changeDescription required'),
  citation: z.string().optional(),
  eventType: z.string().optional(),
  reasoning: z.string().optional(),
});

// ============================================================================
// Reconciliation
// ============================================================================

export const reconciliationSummaryBodySchema = z.object({
  statements: z.record(z.unknown()).optional(),
});

// ============================================================================
// Binder / register statements
// ============================================================================

export const registerStatementsBodySchema = z.object({
  statements: z.record(z.string(), z.unknown()),
  sourceDocumentId: z.string().optional(),
  sourceDocumentName: z.string().optional(),
  reasoningChainId: z.string().optional(),
});
