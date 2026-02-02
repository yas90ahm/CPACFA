/**
 * Zod schemas for close API request validation.
 */

import { z } from 'zod';
import { isoDateSchema, periodLabelSchema, idParamSchema } from './commonSchemas.js';

export const periodLockBodySchema = z.object({
  periodLabel: z.string().min(1, 'periodLabel required'),
  lockedBy: z.string().min(1, 'lockedBy required'),
  reason: z.string().optional(),
});

export type PeriodLockBody = z.infer<typeof periodLockBodySchema>;

// ============================================================================
// Accrual Suggestions
// ============================================================================

export const accrualSuggestionsSchema = z.object({
  periodEnd: isoDateSchema,
  openAR: z.array(z.object({
    invoiceId: z.string(),
    amount: z.number(),
    daysOpen: z.number(),
  })).optional(),
  openAP: z.array(z.object({
    invoiceId: z.string(),
    amount: z.number(),
    daysOpen: z.number(),
  })).optional(),
  payrollData: z.object({
    lastPayDate: z.string().optional(),
    avgBiweeklyPayroll: z.number().optional(),
  }).optional(),
});

// ============================================================================
// Inventory Valuation
// ============================================================================

export const inventoryValuationSchema = z.object({
  layers: z.array(z.object({
    date: z.string(),
    quantity: z.number().int().nonnegative(),
    unitCost: z.number().nonnegative(),
  })).min(1, 'At least one inventory layer required'),
  quantityOnHand: z.number().int().nonnegative(),
  method: z.enum(['FIFO', 'weighted_average']),
});

// ============================================================================
// JE Suggestions
// ============================================================================

export const jeSuggestionsSchema = z.object({
  gaps: z.array(z.record(z.unknown())).optional(),
  mismatches: z.array(z.record(z.unknown())).optional(),
});

export const jeExplainSchema = z.object({
  suggestions: z.array(z.record(z.unknown())),
});

export const jeFromTextSchema = z.object({
  text: z.string().min(1, 'text required'),
  periodEnd: z.string().optional(),
});

// ============================================================================
// Disclosure checklist (agentic)
// ============================================================================

export const disclosureSuggestEvidenceSchema = z.object({
  periodLabel: z.string().min(1, 'periodLabel required'),
  notesExcerpt: z.string().optional(),
});

export const disclosureReviewSummarySchema = z.object({
  periodLabel: z.string().min(1, 'periodLabel required'),
});

// ============================================================================
// Checklist
// ============================================================================

export const createChecklistSchema = z.object({
  periodLabel: z.string().min(1),
  assignee: z.string().optional(),
  dueDate: z.string().optional(),
});

export const checklistPeriodParamSchema = z.object({
  periodLabel: z.string().min(1),
});

export const updateChecklistStepSchema = z.object({
  stepId: z.string().min(1),
  status: z.enum(['pending', 'in_progress', 'completed', 'skipped']).optional(),
  completedBy: z.string().optional(),
  completedAt: z.string().optional(),
  evidence: z.string().optional(),
});

// ============================================================================
// Close Adjustments
// ============================================================================

export const addAdjustmentsSchema = z.object({
  periodLabel: z.string().min(1),
  adjustments: z.array(z.record(z.unknown())).min(1),
});

export const updateAdjustmentStatusSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'posted']),
  reviewedBy: z.string().optional(),
  reviewedAt: z.string().optional(),
  notes: z.string().optional(),
});

// ============================================================================
// Calendar
// ============================================================================

export const setDueDateSchema = z.object({
  periodLabel: z.string().min(1),
  dueDate: isoDateSchema,
});

export const calendarConfigSchema = z.object({
  monthlyDayOffset: z.number().int().min(1).max(31).optional(),
  quarterlyDayOffset: z.number().int().min(1).max(31).optional(),
  annualDayOffset: z.number().int().min(1).max(31).optional(),
  monthlyMonth: z.number().int().min(1).max(12).optional(),
  quarterlyMonth: z.number().int().min(1).max(3).optional(),
  annualMonth: z.number().int().min(1).max(12).optional(),
});

// ============================================================================
// Reconciliation Resolutions
// ============================================================================

export const createReconciliationResolutionSchema = z.object({
  periodLabel: z.string().min(1),
  accountName: z.string().min(1),
  variance: z.number(),
  status: z.enum(['open', 'in_progress', 'resolved', 'waived']).optional(),
  assignee: z.string().optional(),
  resolution: z.string().optional(),
  notes: z.string().optional(),
});

export const updateReconciliationResolutionSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'waived']).optional(),
  resolution: z.string().optional(),
  notes: z.string().optional(),
});

// ============================================================================
// Controls
// ============================================================================

export const createControlSchema = z.object({
  periodLabel: z.string().min(1),
  controlName: z.string().min(1),
  description: z.string().optional(),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annual']).optional(),
  owner: z.string().optional(),
});

export const updateControlSchema = createControlSchema.partial().omit({ periodLabel: true });

export const linkEvidenceSchema = z.object({
  evidenceType: z.enum(['reconciliation', 'sampling', 'pbc', 'document', 'other']),
  evidenceId: z.string().min(1),
  notes: z.string().optional(),
});

export const addAssertionSchema = z.object({
  assertion: z.enum(['existence', 'completeness', 'accuracy', 'valuation', 'rights_obligations', 'presentation', 'cutoff']),
});

// ============================================================================
// Materiality
// ============================================================================

export const setMaterialitySchema = z.object({
  periodLabel: z.string().min(1),
  overallMateriality: z.number().positive(),
  performanceMateriality: z.number().positive().optional(),
  trivialThreshold: z.number().positive().optional(),
  basis: z.string().optional(),
});

export const suggestMaterialitySchema = z.object({
  totalAssets: z.number().positive(),
  totalRevenue: z.number().positive(),
  netIncome: z.number(),
});

// ============================================================================
// Disclosure Checklist
// ============================================================================

export const updateDisclosureSchema = z.object({
  status: z.enum(['not_started', 'in_progress', 'reviewed', 'complete']),
  evidence: z.string().optional(),
  notes: z.string().optional(),
});

// ============================================================================
// Period Close
// ============================================================================

export const setPeriodCloseStatusSchema = z.object({
  periodLabel: z.string().min(1),
  status: z.enum(['not_started', 'in_progress', 'review', 'approved', 'locked']),
  primarySignedBy: z.string().optional(),
  primarySignedAt: z.string().optional(),
});

export const setReviewerSignOffSchema = z.object({
  periodLabel: z.string().min(1),
  reviewerSignedBy: z.string().min(1),
});

