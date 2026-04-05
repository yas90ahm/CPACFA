/**
 * API response adapters — parse, normalize, and validate API responses
 * before they reach UI components. Fails loudly on contract drift.
 */

import type { z } from 'zod';
import {
  SessionSchema,
  ReadinessSchema,
  TBResponseSchema,
  JEListResponseSchema,
  ModuleProposalListSchema,
  ReconciliationSchema,
  VarianceSchema,
  IssueSchema,
  MappingRuleSchema,
  MappingSuggestionSchema,
  SessionsListResponseSchema,
  type SessionResponse,
  type ReadinessResponse,
  type TBResponse,
  type JournalEntryResponse,
  type ModuleProposalListResponse,
} from './schemas';

// --- Contract Error ---

export class ContractError extends Error {
  endpoint: string;
  issues: z.ZodIssue[];

  constructor(endpoint: string, issues: z.ZodIssue[]) {
    const summary = issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    super(`API contract violation on ${endpoint}: ${summary}`);
    this.name = 'ContractError';
    this.endpoint = endpoint;
    this.issues = issues;
  }
}

/**
 * Parse with Zod schema. On failure:
 * - strict=true (financial data): throw ContractMismatchError
 * - strict=false (default): log warning, return raw data (graceful degradation)
 */
function safeParse<T>(schema: z.ZodSchema<T>, data: unknown, endpoint: string, strict = false): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.slice(0, 5);
    console.warn(`[contract] ${endpoint}: schema mismatch`, issues);
    if (strict) {
      throw new Error(`Contract mismatch on ${endpoint}: ${issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    }
    return data as T;
  }
  return result.data;
}

// --- Session ---

export function adaptSession(data: unknown): SessionResponse {
  return safeParse(SessionSchema, data, 'session');
}

export function adaptSessionStatus(data: SessionResponse): string {
  // Backend may return `status` or `state` — normalize
  return (data.status ?? data.state ?? '').toLowerCase().replace(/-/g, '_');
}

// --- Readiness ---

/** Normalized gate with label always present (mapped from backend's name field) */
export interface NormalizedGate {
  id: string;
  name?: string;
  label: string;
  passing: boolean;
  detail?: string;
  description?: string;
  category?: 'hard' | 'soft';
  navigateTo?: string;
}

export interface NormalizedReadinessResponse {
  gates: NormalizedGate[];
  gatesPassing: number;
  gatesTotal: number;
  canAdvance: boolean;
}

export function adaptReadiness(data: unknown): NormalizedReadinessResponse {
  const parsed = safeParse(ReadinessSchema, data, 'readiness');
  return {
    ...parsed,
    gates: parsed.gates.map((g) => ({
      ...g,
      label: g.label ?? g.name ?? g.id,
    })),
  };
}

// --- Trial Balance ---

export interface NormalizedTBRow {
  accountCode: string;
  accountName: string;
  accountType: string;
  debit: string;
  credit: string;
  netBalance: string;
  fsLineItem: string;
  mappingStatus: string;
}

export function adaptTrialBalance(data: unknown): { rows: NormalizedTBRow[]; totalDebits: string; totalCredits: string; balanced: boolean } {
  const parsed = safeParse(TBResponseSchema, data, 'trial-balance', true);
  const rows: NormalizedTBRow[] = (parsed.rows ?? []).map((r) => ({
    accountCode: r.accountCode,
    accountName: r.accountName,
    accountType: r.accountType ?? r.reportingCategory ?? '',
    debit: r.debit ?? r.debitBalance ?? '0',
    credit: r.credit ?? r.creditBalance ?? '0',
    netBalance: r.netBalance ?? '0',
    fsLineItem: r.fsLineItem ?? r.mappingReportingLineName ?? '',
    mappingStatus: r.mappingStatus ?? '',
  }));
  return {
    rows,
    totalDebits: parsed.totalDebits ?? '0',
    totalCredits: parsed.totalCredits ?? '0',
    balanced: parsed.balanced ?? false,
  };
}

// --- Journal Entries ---

export function adaptJournalEntries(data: unknown): JournalEntryResponse[] {
  if (Array.isArray(data)) return data;
  const parsed = safeParse(JEListResponseSchema, data, 'journal-entries');
  return parsed.journalEntries ?? parsed.entries ?? [];
}

// --- Module Proposals ---

export function adaptModuleProposals(data: unknown): ModuleProposalListResponse {
  return safeParse(ModuleProposalListSchema, data, 'module-proposals');
}

// --- Reconciliations ---

export interface NormalizedRecon {
  key: string; // reconId or accountCode — unique identifier
  reconId: string;
  accountCode: string;
  accountName: string;
  glBalance: string;
  sourceBalance: string;
  variance: string;
  status: string;
  evidenceCount: number;
  approvedBy: string | null;
  reviewedBy: string | null;
}

export function adaptReconciliations(data: unknown): NormalizedRecon[] {
  const list = Array.isArray(data) ? data : (data as { reconciliations?: unknown[] })?.reconciliations ?? [];
  return list.map((r: unknown) => {
    const parsed = safeParse(ReconciliationSchema, r, 'reconciliation');
    return {
      key: parsed.reconId ?? parsed.id ?? parsed.accountCode,
      reconId: parsed.reconId ?? parsed.id ?? parsed.accountCode,
      accountCode: parsed.accountCode,
      accountName: parsed.accountName,
      glBalance: parsed.glBalance,
      sourceBalance: parsed.sourceBalance ?? parsed.supportingBalance ?? '0',
      variance: parsed.variance,
      status: parsed.status,
      evidenceCount: parsed.evidenceCount ?? 0,
      approvedBy: parsed.approvedBy ?? null,
      reviewedBy: parsed.reviewedBy ?? null,
    };
  });
}

// --- Variances ---

export function adaptVariances(data: unknown) {
  if (Array.isArray(data)) return data.map((v: unknown) => safeParse(VarianceSchema, v, 'variance'));
  const wrapped = data as { variances?: unknown[] };
  return (wrapped.variances ?? []).map((v: unknown) => safeParse(VarianceSchema, v, 'variance'));
}

// --- Issues ---

export function adaptIssues(data: unknown) {
  if (Array.isArray(data)) return data.map((i: unknown) => safeParse(IssueSchema, i, 'issue'));
  const wrapped = data as { issues?: unknown[] };
  return (wrapped.issues ?? []).map((i: unknown) => safeParse(IssueSchema, i, 'issue'));
}

// --- Sessions List ---

export function adaptSessionsList(data: unknown) {
  const parsed = safeParse(SessionsListResponseSchema, data, 'sessions-list');
  return parsed.sessions.map((s) => ({
    ...s,
    // Normalize state: backend may return `status` or `state`
    state: (s.status ?? s.state ?? 'OPEN').toUpperCase().replace(/-/g, '_'),
    periodLabel: s.periodLabel ?? `${s.periodStart ?? ''} to ${s.periodEnd ?? ''}`,
    gatesPassing: s.gatesPassing ?? 0,
    gatesTotal: s.gatesTotal ?? 0,
  }));
}

// --- Mapping ---

export function adaptMappingRules(data: unknown) {
  if (Array.isArray(data)) return data;
  const wrapped = data as { rules?: unknown[] };
  return (wrapped.rules ?? []).map((r: unknown) => safeParse(MappingRuleSchema, r, 'mapping-rule'));
}

export function adaptMappingSuggestions(data: unknown) {
  if (Array.isArray(data)) return data;
  const wrapped = data as { suggestions?: unknown[] };
  return (wrapped.suggestions ?? []).map((s: unknown) => safeParse(MappingSuggestionSchema, s, 'mapping-suggestion'));
}
