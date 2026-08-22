/**
 * Zod schemas for API response validation.
 * Parse responses before UI consumption — fail loudly on contract drift.
 */

import { z } from 'zod';

// --- Close Session ---

export const SessionSchema = z.object({
  id: z.string(),
  tenantId: z.string().optional(),
  entityId: z.string().optional(),
  entityName: z.string().optional(),
  standard: z.string().optional(),
  basis: z.string().optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  periodLabel: z.string().optional(),
  status: z.string(),
  state: z.string().optional(),
  startedAt: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  closeDayTarget: z.number().optional(),
  statementsGeneratedAt: z.string().nullable().optional(),
  statementsStale: z.boolean().optional(),
  certifiedBy: z.string().nullable().optional(),
  certifiedAt: z.string().nullable().optional(),
  lockedAt: z.string().nullable().optional(),
  advancedToReviewBy: z.string().nullable().optional(),
  advancedToReviewAt: z.string().nullable().optional(),
});
export type SessionResponse = z.infer<typeof SessionSchema>;

// --- Readiness ---

export const GateSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  label: z.string().optional(),
  passing: z.boolean(),
  detail: z.string().optional(),
  description: z.string().optional(),
  category: z.enum(['hard', 'soft']).optional(),
  navigateTo: z.string().optional(),
});

export const ReadinessSchema = z.object({
  gates: z.array(GateSchema),
  gatesPassing: z.number(),
  gatesTotal: z.number(),
  canAdvance: z.boolean(),
});
export type ReadinessResponse = z.infer<typeof ReadinessSchema>;

// --- Trial Balance ---

export const TBRowSchema = z.object({
  accountCode: z.string(),
  accountName: z.string(),
  accountType: z.string().optional(),
  debit: z.string().optional(),
  credit: z.string().optional(),
  debitBalance: z.string().optional(),
  creditBalance: z.string().optional(),
  netBalance: z.string().optional(),
  reportingCategory: z.string().optional(),
  fsLineItem: z.string().optional(),
  mappingReportingLineId: z.string().nullable().optional(),
  mappingReportingLineName: z.string().nullable().optional(),
  mappingStatus: z.string().optional(),
});

export const TBResponseSchema = z.object({
  rows: z.array(TBRowSchema),
  totalDebits: z.string().optional(),
  totalCredits: z.string().optional(),
  balanced: z.boolean().optional(),
  periodLabel: z.string().optional(),
});
export type TBResponse = z.infer<typeof TBResponseSchema>;

// --- Journal Entry ---

export const JournalEntrySchema = z.object({
  id: z.string(),
  status: z.string(),
  memo: z.string().optional(),
  source: z.string().optional(),
  createdBy: z.string().optional(),
  approvedBy: z.string().optional(),
  postedAt: z.string().optional(),
  entryDate: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type JournalEntryResponse = z.infer<typeof JournalEntrySchema>;

export const JEListResponseSchema = z.object({
  journalEntries: z.array(JournalEntrySchema).optional(),
  entries: z.array(JournalEntrySchema).optional(),
}).passthrough();

// --- Module Proposal ---

export const ModuleProposalSchema = z.object({
  id: z.string(),
  moduleName: z.string(),
  standard: z.string().optional(),
  status: z.string(),
  jeId: z.string().nullable().optional(),
  computationInputs: z.unknown().optional(),
  dataQualityFlags: z.unknown().optional(),
  skipReason: z.string().nullable().optional(),
  notApplicableReason: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  reviewedBy: z.string().nullable().optional(),
  reviewedAt: z.string().nullable().optional(),
});

export const ModuleProposalListSchema = z.object({
  proposals: z.array(ModuleProposalSchema),
  summary: z.object({
    total: z.number(),
    needsReview: z.number(),
    approved: z.number().optional(),
    skipped: z.number().optional(),
    notApplicable: z.number().optional(),
    failed: z.number().optional(),
  }),
});
export type ModuleProposalListResponse = z.infer<typeof ModuleProposalListSchema>;

// --- Reconciliation ---

export const ReconciliationSchema = z.object({
  reconId: z.string().optional(),
  id: z.string().optional(),
  accountCode: z.string(),
  accountName: z.string(),
  glBalance: z.string(),
  supportingBalance: z.string().optional(),
  sourceBalance: z.string().optional(),
  variance: z.string(),
  status: z.string(),
  evidenceCount: z.number().optional(),
  approvedBy: z.string().nullable().optional(),
  reviewedBy: z.string().nullable().optional(),
  preparedBy: z.string().nullable().optional(),
});

// --- Variance ---

export const VarianceSchema = z.object({
  id: z.string(),
  lineItemName: z.string().optional(),
  fsLineId: z.string().optional(),
  isMaterial: z.boolean(),
  explanationStatus: z.string(),
  changePercent: z.number().optional(),
  changeAmount: z.string().optional(),
  currentAmount: z.string().optional(),
  priorAmount: z.string().optional(),
  explanation: z.string().optional(),
  explanationSource: z.string().optional(),
});

// --- Issue ---

export const IssueSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  severity: z.string(),
  category: z.string().optional(),
  status: z.string(),
});

// --- Mapping ---

export const MappingRuleSchema = z.object({
  id: z.string(),
  sourceAccountNumberPattern: z.string().optional(),
  sourceAccountNamePattern: z.string().optional(),
  mappedFsLineId: z.string().optional(),
  confidenceDefault: z.number().optional(),
  version: z.number().optional(),
}).passthrough();

export const MappingSuggestionSchema = z.object({
  accountCode: z.string(),
  accountName: z.string().optional(),
  suggestedLineItemId: z.string().nullable().optional(),
  suggestedLineItemName: z.string().nullable().optional(),
  confidence: z.union([z.string(), z.number()]).optional(),
  reasoning: z.string().optional(),
}).passthrough();

// --- Sessions List ---

export const SessionListItemSchema = z.object({
  id: z.string(),
  state: z.string().optional(),
  status: z.string().optional(),
  periodLabel: z.string().optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  entityName: z.string().optional(),
  entityId: z.string().optional(),
  gatesPassing: z.number().optional(),
  gatesTotal: z.number().optional(),
  certifiedBy: z.string().nullable().optional(),
  updatedAt: z.string().optional(),
  startedAt: z.string().optional(),
  createdAt: z.string().optional(),
  closeDayTarget: z.number().optional(),
}).passthrough();

export const SessionsListResponseSchema = z.object({
  sessions: z.array(SessionListItemSchema),
});
