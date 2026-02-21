/**
 * @deprecated FULLY DEPRECATED — Do not use.
 * All issue operations now use issue_service.ts + tenant_close_issues table.
 * This file is retained temporarily for reference only.
 * TODO: Remove this file and drop tenant_issue_items table.
 *
 * Issue (Exception) service: create, resolve, assign, list.
 * Helpers to emit issues from import validations, low-confidence classifications, integrity failures.
 */

import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import type {
  IssueItem,
  IssueCategory,
  IssueSeverity,
  IssueStatus,
  CreateIssueInput,
  ListIssuesFilters,
} from '../types/issue_item.js';
import * as repo from '../db/repositories/issue_item_repository.js';
import { getCloseSessionById } from '../db/repositories/close_session_repository.js';
import { recordMaterialEvent } from './audit_service.js';

export class IssueItemError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'VALIDATION' | 'INVALID_STATUS'
  ) {
    super(message);
    this.name = 'IssueItemError';
  }
}

const RESOLVED_STATUSES: IssueStatus[] = ['resolved', 'wont_fix'];

export async function createIssue(pool: Pool, input: CreateIssueInput): Promise<IssueItem> {
  const status = input.status ?? 'open';
  const id = randomUUID();
  return repo.insertIssueItem(pool, id, {
    closeSessionId: input.closeSessionId,
    tenantId: input.tenantId,
    category: input.category,
    severity: input.severity,
    status,
    title: input.title,
    description: input.description ?? null,
    impactPl: input.impactPl ?? null,
    impactBs: input.impactBs ?? null,
    impactCash: input.impactCash ?? null,
    currency: input.currency ?? null,
    materialityEstimate: input.materialityEstimate ?? null,
    materialityThresholdUsed: input.materialityThresholdUsed ?? null,
    confidenceScore: input.confidenceScore ?? null,
    sourceRef: input.sourceRef ?? null,
    assignedTo: input.assignedTo ?? null,
    dueDate: input.dueDate ?? null,
    createdBy: input.createdBy ?? null,
    updatedBy: input.createdBy ?? null,
  });
}

export async function getIssue(pool: Pool, tenantId: string, id: string): Promise<IssueItem | null> {
  return repo.getIssueItemById(pool, tenantId, id);
}

export async function listIssues(pool: Pool, filters: ListIssuesFilters): Promise<IssueItem[]> {
  return repo.listIssueItems(pool, {
    tenantId: filters.tenantId,
    closeSessionId: filters.closeSessionId,
    category: filters.category,
    severity: filters.severity,
    status: filters.status,
    assignedTo: filters.assignedTo,
  });
}

export async function resolveIssue(
  pool: Pool,
  tenantId: string,
  id: string,
  resolution: 'resolved' | 'wont_fix',
  updatedBy?: string
): Promise<IssueItem> {
  const current = await repo.getIssueItemById(pool, tenantId, id);
  if (!current) throw new IssueItemError('Issue not found', 'NOT_FOUND');
  if (RESOLVED_STATUSES.includes(current.status)) {
    throw new IssueItemError(`Issue already in terminal status: ${current.status}`, 'INVALID_STATUS');
  }
  const updated = await repo.updateIssueStatus(pool, tenantId, id, resolution, updatedBy);
  if (!updated) throw new IssueItemError('Issue not found', 'NOT_FOUND');
  return updated;
}

export async function assignIssue(
  pool: Pool,
  tenantId: string,
  id: string,
  assignedTo: string | null,
  dueDate?: string | null,
  updatedBy?: string
): Promise<IssueItem> {
  const updated = await repo.updateIssueAssignment(pool, tenantId, id, assignedTo, dueDate, updatedBy);
  if (!updated) throw new IssueItemError('Issue not found', 'NOT_FOUND');
  return updated;
}

export async function updateIssueStatus(
  pool: Pool,
  tenantId: string,
  id: string,
  status: IssueStatus,
  updatedBy?: string
): Promise<IssueItem> {
  const current = await repo.getIssueItemById(pool, tenantId, id);
  if (!current) throw new IssueItemError('Issue not found', 'NOT_FOUND');
  if (RESOLVED_STATUSES.includes(current.status)) {
    throw new IssueItemError(`Cannot change status of resolved issue: ${current.status}`, 'INVALID_STATUS');
  }
  const updated = await repo.updateIssueStatus(pool, tenantId, id, status, updatedBy);
  if (!updated) throw new IssueItemError('Issue not found', 'NOT_FOUND');
  const periodLabel = current.closeSessionId
    ? (await getCloseSessionById(pool, tenantId, current.closeSessionId))?.periodEnd?.slice(0, 7)
    : undefined;
  await recordMaterialEvent(pool, {
    tenantId,
    periodLabel,
    eventType: 'issue_status_change',
    deterministicFlagSnapshot: {
      issueId: id,
      previousStatus: current.status,
      newStatus: status,
      closeSessionId: current.closeSessionId,
    },
    createdBy: updatedBy,
  });
  return updated;
}

// --- Helpers: emit issues from other domains ---

export interface EmitIssueContext {
  pool: Pool;
  tenantId: string;
  closeSessionId: string;
  createdBy?: string;
}

/**
 * Create an issue from import/trial balance validation failure.
 */
export async function createIssueFromImportValidation(
  ctx: EmitIssueContext,
  opts: {
    title: string;
    description?: string;
    severity?: IssueSeverity;
    sourceRef?: Record<string, unknown>;
  }
): Promise<IssueItem> {
  return createIssue(ctx.pool, {
    closeSessionId: ctx.closeSessionId,
    tenantId: ctx.tenantId,
    category: 'intake',
    severity: opts.severity ?? 'med',
    title: opts.title,
    description: opts.description,
    sourceRef: opts.sourceRef,
    createdBy: ctx.createdBy,
  });
}

/**
 * Create an issue from low-confidence classification (e.g. account mapping).
 */
export async function createIssueFromLowConfidenceClassification(
  ctx: EmitIssueContext,
  opts: {
    title: string;
    description?: string;
    confidenceScore: number;
    accountName?: string;
    suggestedType?: string;
    sourceRef?: Record<string, unknown>;
    severity?: IssueSeverity;
  }
): Promise<IssueItem> {
  return createIssue(ctx.pool, {
    closeSessionId: ctx.closeSessionId,
    tenantId: ctx.tenantId,
    category: 'classification',
    severity: opts.severity ?? (opts.confidenceScore < 0.5 ? 'high' : 'med'),
    title: opts.title,
    description: opts.description,
    confidenceScore: opts.confidenceScore,
    sourceRef: opts.sourceRef ?? {
      ...(opts.accountName && { accountName: opts.accountName }),
      ...(opts.suggestedType && { suggestedType: opts.suggestedType }),
    },
    createdBy: ctx.createdBy,
  });
}

/**
 * Create an issue from integrity check failure (e.g. imbalance, covenant breach, plug detection).
 */
export async function createIssueFromIntegrityFailure(
  ctx: EmitIssueContext,
  opts: {
    title: string;
    description?: string;
    severity?: IssueSeverity;
    category?: 'reconciliation' | 'posting' | 'export_blocker';
    impactPl?: number;
    impactBs?: number;
    impactCash?: number;
    currency?: string;
    materialityEstimate?: number;
    materialityThresholdUsed?: number;
    sourceRef?: Record<string, unknown>;
  }
): Promise<IssueItem> {
  return createIssue(ctx.pool, {
    closeSessionId: ctx.closeSessionId,
    tenantId: ctx.tenantId,
    category: opts.category ?? 'posting',
    severity: opts.severity ?? 'high',
    title: opts.title,
    description: opts.description,
    impactPl: opts.impactPl,
    impactBs: opts.impactBs,
    impactCash: opts.impactCash,
    currency: opts.currency,
    materialityEstimate: opts.materialityEstimate,
    materialityThresholdUsed: opts.materialityThresholdUsed,
    sourceRef: opts.sourceRef,
    createdBy: ctx.createdBy,
  });
}
