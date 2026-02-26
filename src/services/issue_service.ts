/**
 * Issue Service — Central HITL Issue Resolution System
 *
 * Every problem detected during a close becomes an Issue.
 * Lifecycle: DETECTED → ASSIGNED → IN_PROGRESS → RESOLVED → VERIFIED (or WAIVED).
 *
 * - Issues are created by detection functions throughout the codebase.
 * - Issues are resolved by human actions (AJE posted, mapping fixed, etc.).
 * - Issues auto-verify when the system re-checks and confirms the fix worked.
 * - Every status change is recorded in append-only history.
 * - Open blocking/critical issues prevent certification (hard gate).
 */

import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import type {
  CloseIssue,
  CloseIssueStatus,
  CloseIssueSeverity,
  CloseIssueCategory,
  IssueType,
  IssueHistoryEntry,
  CreateCloseIssueInput,
  ResolveIssueInput,
  IssueSummary,
} from '../types/close_issue.js';
import * as repo from '../db/repositories/close_issue_repository.js';
import { getCloseSessionById } from '../db/repositories/close_session_repository.js';

const TERMINAL_STATUSES: CloseIssueStatus[] = ['verified', 'waived'];
const OPEN_STATUSES: CloseIssueStatus[] = ['detected', 'assigned', 'in_progress', 'resolved'];
const BLOCKING_SEVERITIES: CloseIssueSeverity[] = ['critical', 'blocking'];
const WAIVABLE_SEVERITIES: CloseIssueSeverity[] = ['warning', 'info'];

export class IssueServiceError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'INVALID_STATUS' | 'VALIDATION' | 'CANNOT_WAIVE'
  ) {
    super(message);
    this.name = 'IssueServiceError';
  }
}

function assertIssue<T>(issue: T | null): asserts issue is T {
  if (!issue) throw new IssueServiceError('Issue not found', 'NOT_FOUND');
}

/** Create a new issue in DETECTED status. */
export async function createIssue(pool: Pool, input: CreateCloseIssueInput): Promise<CloseIssue> {
  const issueId = randomUUID();
  const issue = await repo.insertCloseIssue(pool, issueId, {
    ...input,
    status: 'detected',
  });
  await repo.appendIssueHistory(pool, issue.issueId, 'detected', 'detected', 'system', 'Issue created');
  return issue;
}

/** Assign issue (DETECTED → ASSIGNED or reassign). */
export async function assignIssue(
  pool: Pool,
  tenantId: string,
  issueId: string,
  assignedTo: string,
  assignedBy: string
): Promise<CloseIssue> {
  const current = await repo.getCloseIssueById(pool, tenantId, issueId);
  assertIssue(current);
  if (TERMINAL_STATUSES.includes(current.status)) {
    throw new IssueServiceError(`Issue is in terminal status: ${current.status}`, 'INVALID_STATUS');
  }
  const now = new Date().toISOString();
  const updated = await repo.updateIssueStatus(pool, tenantId, issueId, 'assigned', {
    assignedTo,
    assignedAt: now,
    assignedBy,
  });
  assertIssue(updated);
  await repo.appendIssueHistory(pool, issueId, current.status, 'assigned', assignedBy, `Assigned to ${assignedTo}`);
  return updated;
}

/** Start progress (DETECTED or ASSIGNED → IN_PROGRESS). */
export async function startProgress(
  pool: Pool,
  tenantId: string,
  issueId: string,
  userId: string
): Promise<CloseIssue> {
  const current = await repo.getCloseIssueById(pool, tenantId, issueId);
  assertIssue(current);
  if (TERMINAL_STATUSES.includes(current.status)) {
    throw new IssueServiceError(`Issue is in terminal status: ${current.status}`, 'INVALID_STATUS');
  }
  const updated = await repo.updateIssueStatus(pool, tenantId, issueId, 'in_progress', {});
  assertIssue(updated);
  await repo.appendIssueHistory(pool, issueId, current.status, 'in_progress', userId, null);
  return updated;
}

/** Resolve issue (→ RESOLVED) with resolution type and description. */
export async function resolveIssue(
  pool: Pool,
  tenantId: string,
  issueId: string,
  resolution: ResolveIssueInput
): Promise<CloseIssue> {
  const current = await repo.getCloseIssueById(pool, tenantId, issueId);
  assertIssue(current);
  if (TERMINAL_STATUSES.includes(current.status)) {
    throw new IssueServiceError(`Issue is in terminal status: ${current.status}`, 'INVALID_STATUS');
  }
  if (!resolution.resolutionDescription?.trim()) {
    throw new IssueServiceError('Resolution description is required', 'VALIDATION');
  }
  const now = new Date().toISOString();
  const updated = await repo.updateIssueStatus(pool, tenantId, issueId, 'resolved', {
    resolutionType: resolution.resolutionType,
    resolutionDescription: resolution.resolutionDescription,
    resolutionAjeId: resolution.resolutionAjeId ?? null,
    resolutionReconId: resolution.resolutionReconId ?? null,
    resolutionMappingChange: resolution.resolutionMappingChange ?? null,
    resolvedBy: resolution.resolvedBy,
    resolvedAt: now,
  });
  assertIssue(updated);
  await repo.appendIssueHistory(
    pool,
    issueId,
    current.status,
    'resolved',
    resolution.resolvedBy,
    resolution.resolutionDescription
  );
  return updated;
}

/** Verify issue (RESOLVED → VERIFIED). */
export async function verifyIssue(
  pool: Pool,
  tenantId: string,
  issueId: string,
  verifiedBy: string,
  method: 'automatic_recheck' | 'manual_review'
): Promise<CloseIssue> {
  const current = await repo.getCloseIssueById(pool, tenantId, issueId);
  assertIssue(current);
  if (current.status !== 'resolved') {
    throw new IssueServiceError(`Verify only from resolved; current: ${current.status}`, 'INVALID_STATUS');
  }
  const now = new Date().toISOString();
  const updated = await repo.updateIssueStatus(pool, tenantId, issueId, 'verified', {
    verifiedBy,
    verifiedAt: now,
    verificationMethod: method,
  });
  assertIssue(updated);
  await repo.appendIssueHistory(pool, issueId, 'resolved', 'verified', verifiedBy, method);
  return updated;
}

/** Waive issue (→ WAIVED). Only for WARNING and INFO. */
export async function waiveIssue(
  pool: Pool,
  tenantId: string,
  issueId: string,
  justification: string,
  waivedBy: string
): Promise<CloseIssue> {
  const current = await repo.getCloseIssueById(pool, tenantId, issueId);
  assertIssue(current);
  if (!WAIVABLE_SEVERITIES.includes(current.severity)) {
    throw new IssueServiceError(
      `Cannot waive ${current.severity} issue; only warning and info can be waived`,
      'CANNOT_WAIVE'
    );
  }
  if (!justification?.trim()) {
    throw new IssueServiceError('Waive justification is required', 'VALIDATION');
  }
  if (TERMINAL_STATUSES.includes(current.status)) {
    throw new IssueServiceError(`Issue is in terminal status: ${current.status}`, 'INVALID_STATUS');
  }
  const updated = await repo.updateIssueStatus(pool, tenantId, issueId, 'waived', {});
  assertIssue(updated);
  await repo.appendIssueHistory(pool, issueId, current.status, 'waived', waivedBy, justification);
  return updated;
}

/** Reopen issue (RESOLVED or VERIFIED → IN_PROGRESS). */
export async function reopenIssue(
  pool: Pool,
  tenantId: string,
  issueId: string,
  reason: string,
  userId: string
): Promise<CloseIssue> {
  const current = await repo.getCloseIssueById(pool, tenantId, issueId);
  assertIssue(current);
  if (current.status !== 'resolved' && current.status !== 'verified') {
    throw new IssueServiceError(`Reopen only from resolved or verified; current: ${current.status}`, 'INVALID_STATUS');
  }
  if (!reason?.trim()) {
    throw new IssueServiceError('Reopen reason is required', 'VALIDATION');
  }
  const updated = await repo.updateIssueStatus(pool, tenantId, issueId, 'in_progress', {
    resolutionType: undefined,
    resolutionDescription: undefined,
    resolvedBy: undefined,
    resolvedAt: undefined,
    verifiedBy: undefined,
    verifiedAt: undefined,
    verificationMethod: undefined,
  });
  assertIssue(updated);
  await repo.appendIssueHistory(pool, issueId, current.status, 'in_progress', userId, reason);
  return updated;
}

/** Get all open issues for a period (not verified/waived). */
export async function getOpenIssuesForPeriod(pool: Pool, periodId: string, tenantId: string): Promise<CloseIssue[]> {
  const all = await repo.listCloseIssues(pool, { tenantId, periodId });
  return all.filter((i) => !TERMINAL_STATUSES.includes(i.status));
}

/** Get blocking issues (critical or blocking severity, not verified/waived). Used by certification gate. */
export async function getBlockingIssuesForPeriod(
  pool: Pool,
  periodId: string,
  tenantId: string
): Promise<CloseIssue[]> {
  const open = await getOpenIssuesForPeriod(pool, periodId, tenantId);
  return open.filter((i) => BLOCKING_SEVERITIES.includes(i.severity));
}

/** Get issue summary counts by severity and status for dashboard. */
export async function getIssueSummaryForPeriod(
  pool: Pool,
  periodId: string,
  tenantId: string
): Promise<IssueSummary> {
  const issues = await repo.listCloseIssues(pool, { tenantId, periodId });
  const summary: IssueSummary = {
    critical: { open: 0, resolved: 0, verified: 0 },
    blocking: { open: 0, resolved: 0, verified: 0 },
    warning: { open: 0, resolved: 0, verified: 0, waived: 0 },
    info: { open: 0, resolved: 0, verified: 0, waived: 0 },
  };
  for (const i of issues) {
    const s = summary[i.severity as keyof IssueSummary];
    if (!s) continue;
    if (i.status === 'verified') s.verified += 1;
    else if (i.status === 'waived') (s as { waived?: number }).waived = ((s as { waived?: number }).waived ?? 0) + 1;
    else if (i.status === 'resolved') s.resolved += 1;
    else s.open += 1;
  }
  return summary;
}

/** Get full history for an issue. */
export async function getIssueHistory(pool: Pool, issueId: string): Promise<IssueHistoryEntry[]> {
  return repo.getIssueHistory(pool, issueId);
}

/** Get single issue by id. */
export async function getIssue(pool: Pool, tenantId: string, issueId: string): Promise<CloseIssue | null> {
  return repo.getCloseIssueById(pool, tenantId, issueId);
}

/** List issues with filters. */
export async function listIssues(
  pool: Pool,
  filters: {
    tenantId: string;
    periodId?: string;
    status?: CloseIssueStatus;
    severity?: string;
    category?: string;
    issueType?: string;
  }
): Promise<CloseIssue[]> {
  return repo.listCloseIssues(pool, filters);
}

// --- Internal: used by auto-resolution and detection ---

/** Transition issue to verified by system (no history from null). */
export async function autoVerifyIssue(
  pool: Pool,
  tenantId: string,
  issueId: string
): Promise<CloseIssue | null> {
  const current = await repo.getCloseIssueById(pool, tenantId, issueId);
  if (!current || TERMINAL_STATUSES.includes(current.status)) return null;
  const now = new Date().toISOString();
  const updated = await repo.updateIssueStatus(pool, tenantId, issueId, 'verified', {
    verifiedBy: 'system',
    verifiedAt: now,
    verificationMethod: 'automatic_recheck',
  });
  if (updated) {
    await repo.appendIssueHistory(pool, issueId, current.status, 'verified', 'system', 'Automatic recheck passed');
  }
  return updated;
}

// --- Legacy compatibility: create from session + legacy category/severity (single issue store) ---

/** Legacy category (issue_item) → CloseIssueCategory */
function mapLegacyCategoryToClose(
  category: string
): CloseIssueCategory {
  const map: Record<string, CloseIssueCategory> = {
    intake: 'ingestion',
    classification: 'ingestion',
    reconciliation: 'reconciliation',
    posting: 'adjustment',
    policy: 'review',
    presentation: 'statement',
    export_blocker: 'statement',
  };
  return (map[category] ?? 'general') as CloseIssueCategory;
}

/** Legacy severity (low|med|high|critical) → CloseIssueSeverity */
function mapLegacySeverityToClose(severity: string): CloseIssueSeverity {
  const map: Record<string, CloseIssueSeverity> = {
    low: 'info',
    med: 'warning',
    high: 'blocking',
    critical: 'critical',
  };
  return (map[severity] ?? 'warning') as CloseIssueSeverity;
}

export interface CreateIssueForSessionInput {
  closeSessionId: string;
  tenantId: string;
  entityId?: string;
  issueType?: IssueType;
  category: string;
  severity: string;
  title: string;
  description?: string;
  sourceRef?: Record<string, unknown>;
  createdBy?: string;
}

/**
 * Create an issue for a close session (legacy-style input).
 * Resolves entityId from session if not provided. Use for all callers migrating from issue_item_service.
 */
export async function createIssueForSession(
  pool: Pool,
  input: CreateIssueForSessionInput
): Promise<CloseIssue> {
  let entityId = input.entityId;
  if (entityId == null) {
    const session = await getCloseSessionById(pool, input.tenantId, input.closeSessionId);
    entityId = session?.entityId ?? 'unknown';
  }
  return createIssue(pool, {
    tenantId: input.tenantId,
    periodId: input.closeSessionId,
    entityId,
    issueType: input.issueType ?? 'manual_flag',
    severity: mapLegacySeverityToClose(input.severity),
    category: mapLegacyCategoryToClose(input.category),
    title: input.title,
    description: input.description,
    sourceCheck: 'migrated_from_legacy',
    sourceDetails: input.sourceRef ?? {},
  });
}

export interface CreateIssueFromIntegrityFailureContext {
  pool: Pool;
  tenantId: string;
  closeSessionId: string;
  createdBy?: string;
}

/**
 * Create an issue from an integrity/export failure (e.g. imbalance, covenant conflict).
 * Replaces issue_item_service.createIssueFromIntegrityFailure for single issue store.
 */
export async function createIssueFromIntegrityFailure(
  ctx: CreateIssueFromIntegrityFailureContext,
  opts: {
    title: string;
    description?: string;
    severity?: string;
    category?: 'reconciliation' | 'posting' | 'export_blocker';
    sourceRef?: Record<string, unknown>;
  }
): Promise<CloseIssue> {
  return createIssueForSession(ctx.pool, {
    closeSessionId: ctx.closeSessionId,
    tenantId: ctx.tenantId,
    category: opts.category ?? 'posting',
    severity: opts.severity ?? 'high',
    title: opts.title,
    description: opts.description,
    sourceRef: opts.sourceRef,
    createdBy: ctx.createdBy,
  });
}
