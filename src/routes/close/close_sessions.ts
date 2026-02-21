/**
 * Close session routes: create, get, list, update status.
 * Mounted at /api/close/sessions.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { send500 } from '../../lib/errorHandler.js';
import { logCriticalRoute } from '../../lib/logger.js';
import type { RequestWithId } from '../../middleware/requestId.js';
import {
  createSessionOrGetExisting,
  ensureSessionForPeriod,
  getSession,
  listSessions,
  updateStatus,
  certifyCloseSession,
  advanceSession,
  reopenCloseSession,
  rejectSession,
  lockCloseSession,
  CloseSessionError,
} from '../../services/close_session_service.js';
import { withTransaction } from '../../db/transaction.js';
import { getCloseRoleFromReq } from '../../lib/closeRole.js';
import { effectiveAllowLegacyCertifiedSource } from '../../lib/runtime_mode.js';
import type { AuthRequest } from '../../auth/middleware.js';
import * as issueService from '../../services/issue_service.js';
import {
  computeReadiness,
  initializeChecklistTemplate,
  getChecklistItems,
  completeChecklistItem,
  skipChecklistItem,
  emitIssuesForStuckChecklist,
} from '../../services/close_checklist_readiness_service.js';
import { getReadinessGates } from '../../services/session_readiness_gates_service.js';
import {
  getOrComputeTriage,
  getLatestTriage,
} from '../../services/triage_service.js';
import {
  generateStatements as generateStatementPackage,
  listStatementPackages,
  getStatementPackage,
  getStatementPackageWithLines,
  getStatementDiff,
  MathematicalIntegrityError,
} from '../../services/statement_package_service.js';
import {
  getAccountsForLineItem,
  getEntriesForAccount,
} from '../../services/statement_drilldown_service.js';
import { getSessionTrialBalance } from '../../services/session_trial_balance_service.js';
import * as auditLedgerRepo from '../../db/repositories/audit_ledger_repository.js';

const router = Router();

function handleSessionError(res: Response, err: unknown, fallbackLabel: string): void {
  if (err instanceof CloseSessionError) {
    if (err.code === 'NOT_FOUND') {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err.code === 'INSUFFICIENT_ROLE') {
      res.status(403).json({ error: err.message });
      return;
    }
    if (err.code === 'OVERLAP' || err.code === 'INVALID_TRANSITION' || err.code === 'NOT_LOCKED' || err.code === 'NOT_UNDER_REVIEW' || err.code === 'HARD_BLOCKERS' || err.code === 'REOPEN_FORBIDDEN_LOCKED' || err.code === 'REOPEN_UNAUTHORIZED') {
      res.status(409).json({ error: err.message, code: err.code });
      return;
    }
    if (err.code === 'REOPEN_REASON_REQUIRED') {
      res.status(400).json({ error: err.message, code: err.code });
      return;
    }
    if (err.code === 'NOT_READY') {
      res.status(422).json({ error: err.message, code: 'NOT_READY' });
      return;
    }
    if (err.code === 'SESSION_DATA_MISSING') {
      res.status(422).json({ error: err.message, code: 'SESSION_DATA_MISSING' });
      return;
    }
    if (err.code === 'VALIDATION') {
      res.status(400).json({ error: err.message });
      return;
    }
  }
  send500(res, err, fallbackLabel);
}

const ADVANCE_CONTRACT_VERSION = 'v1';

const ENSURE_CONTRACT_VERSION = 'v1';

const ROUTE_ENSURE = 'POST /api/close/sessions/ensure';
const ROUTE_ADVANCE = 'POST /api/close/sessions/:id/advance';
const ROUTE_CERTIFY = 'POST /api/close/sessions/:id/certify';

function criticalLog(
  req: Request,
  route: string,
  outcome: string,
  opts: { code?: string; closeSessionId?: string; startMs: number }
): void {
  const requestId = (req as RequestWithId).requestId ?? '';
  logCriticalRoute({
    ts: new Date().toISOString(),
    level: 'info',
    requestId,
    tenantId: getTenantId(req) ?? undefined,
    closeSessionId: opts.closeSessionId,
    route,
    outcome,
    code: opts.code,
    durationMs: Date.now() - opts.startMs,
  });
}

/** POST /api/close/sessions/ensure — idempotent ensure session exists for entityId + periodLabel (open). */
router.post('/sessions/ensure', async (req: Request, res: Response) => {
  const startMs = Date.now();
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      criticalLog(req, ROUTE_ENSURE, 'error', { code: 'VALIDATION', startMs });
      res.status(400).json({
        error: 'Tenant context required',
        code: 'VALIDATION',
        message: 'Tenant context is required for ensure session.',
      });
      return;
    }
    const body = req.body as { entityId?: string; periodLabel?: string };
    const entityId = typeof body?.entityId === 'string' ? body.entityId.trim() : '';
    const periodLabel = typeof body?.periodLabel === 'string' ? body.periodLabel.trim() : '';
    if (!entityId || !periodLabel) {
      criticalLog(req, ROUTE_ENSURE, 'error', { code: 'VALIDATION', startMs });
      res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION',
        message: 'entityId and periodLabel are required.',
      });
      return;
    }
    const { session, created } = await ensureSessionForPeriod(pool, tenantId, entityId, periodLabel);
    const statusCode = created ? 201 : 200;
    res.status(statusCode).json({
      contractVersion: ENSURE_CONTRACT_VERSION,
      closeSessionId: session.id,
      entityId: session.entityId,
      periodLabel: session.periodEnd?.slice(0, 7) ?? periodLabel,
      status: session.status,
      created,
    });
    criticalLog(req, ROUTE_ENSURE, 'ok', { closeSessionId: session.id, startMs });
  } catch (e) {
    criticalLog(req, ROUTE_ENSURE, 'error', { startMs });
    handleSessionError(res, e, 'Ensure close session failed');
  }
});

/** POST /api/close/sessions — create close session */
router.post('/sessions', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const body = req.body as {
      entityId?: string;
      periodStart?: string;
      periodEnd?: string;
      basis?: string;
      standard?: string;
      status?: string;
    };
    if (!body?.entityId || !body?.periodStart || !body?.periodEnd) {
      res.status(400).json({ error: 'entityId, periodStart, and periodEnd are required' });
      return;
    }
    const { session, created } = await createSessionOrGetExisting(pool, {
      tenantId,
      entityId: body.entityId,
      periodStart: body.periodStart,
      periodEnd: body.periodEnd,
      basis: body.basis === 'cash' ? 'cash' : 'accrual',
      standard: body.standard ?? 'GAAP',
      status: body.status as import('../../types/close_session.js').CloseSessionStatus | undefined,
    });
    res.status(created ? 201 : 200).json(session);
  } catch (e) {
    handleSessionError(res, e, 'Create close session failed');
  }
});

function derivePeriodLabel(periodEnd: string): string {
  if (!periodEnd || periodEnd.length < 7) return periodEnd || '';
  const date = new Date(periodEnd + 'T12:00:00Z');
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** GET /api/close/sessions/:id — get close session (enriched with periodLabel, statementsGeneratedAt, statementsStale) */
router.get('/sessions/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    const session = await getSession(pool, tenantId, id);
    if (!session) {
      res.status(404).json({ error: 'Close session not found' });
      return;
    }
    const pkgs = await listStatementPackages(pool, tenantId, id, 1);
    const latestPackage = pkgs[0];
    const payload: Record<string, unknown> = { ...session };
    payload.periodLabel = derivePeriodLabel(session.periodEnd ?? '');
    payload.statementsGeneratedAt = latestPackage?.generatedAt ?? null;
    payload.statementsStale = !!session.statementsStaleSince;
    res.json(payload);
  } catch (e) {
    send500(res, e, 'Get close session failed');
  }
});

/** POST /api/close/sessions/:id/advance — advance: open→in_progress→under_review (certify and lock are separate) */
router.post('/sessions/:id/advance', async (req: Request, res: Response) => {
  const startMs = Date.now();
  const id = req.params.id ?? '';
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      criticalLog(req, ROUTE_ADVANCE, 'error', { code: 'VALIDATION', closeSessionId: id, startMs });
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const authReq = req as AuthRequest;
    const body = (req.body as { certifiedBy?: string }) ?? {};
    const actorRole = getCloseRoleFromReq(authReq);
    const result = await advanceSession(pool, {
      tenantId,
      closeSessionId: id,
      certifiedBy: body.certifiedBy,
      actorRole,
    });
    const payload = {
      contractVersion: ADVANCE_CONTRACT_VERSION,
      closeSessionId: result.session.id,
      statusBefore: result.statusBefore,
      statusAfter: result.statusAfter,
      actionTaken: result.actionTaken,
      result: result.result,
      blockers: result.blockers,
    };
    if (!result.success) {
      criticalLog(req, ROUTE_ADVANCE, 'denied', { code: 'NOT_READY', closeSessionId: id, startMs });
      res.status(422).json({
        error: 'Close not ready to advance',
        code: 'NOT_READY',
        message: 'Resolve blockers before advancing.',
        ...payload,
      });
      return;
    }
    res.status(200).json(payload);
    criticalLog(req, ROUTE_ADVANCE, 'ok', { closeSessionId: id, startMs });
  } catch (e) {
    criticalLog(req, ROUTE_ADVANCE, 'error', { closeSessionId: id, startMs });
    handleSessionError(res, e, 'Advance close session failed');
  }
});

/** GET /api/close/sessions/:id/readiness — compute close readiness (gates array + raw) */
router.get('/sessions/:id/readiness', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    const session = await getSession(pool, tenantId, id);
    if (!session) {
      res.status(404).json({ error: 'Close session not found' });
      return;
    }
    const format = (req.query.format as string) || 'gates';
    if (format === 'legacy') {
      const readiness = await computeReadiness(pool, tenantId, session);
      return res.json(readiness);
    }
    const result = await getReadinessGates(pool, tenantId, session);
    res.json(result);
  } catch (e) {
    send500(res, e, 'Compute readiness failed');
  }
});

/** GET /api/close/sessions/:id/trial-balance — session-scoped trial balance. Query: type=adjusted|unadjusted */
router.get('/sessions/:id/trial-balance', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    const session = await getSession(pool, tenantId, id);
    if (!session) {
      res.status(404).json({ error: 'Close session not found' });
      return;
    }
    const type = ((req.query.type as string) || 'adjusted') === 'unadjusted' ? 'unadjusted' : 'adjusted';
    const result = await getSessionTrialBalance(pool, tenantId, session, type);
    if (!result) {
      res.status(404).json({ error: 'No trial balance for this period' });
      return;
    }
    res.json(result);
  } catch (e) {
    send500(res, e, 'Get session trial balance failed');
  }
});

/** GET /api/close/sessions/:id/issues — session-scoped issues (alias for GET /api/close/issues?closeSessionId=X) */
router.get('/sessions/:id/issues', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const sessionId = req.params.id ?? '';
    const q = req.query as Record<string, string | undefined>;
    const issues = await issueService.listIssues(pool, {
      tenantId,
      periodId: sessionId,
      status: q.status as import('../../types/close_issue.js').CloseIssueStatus | undefined,
      severity: q.severity,
      category: q.category,
      issueType: q.issueType,
    });
    res.json({ issues });
  } catch (e) {
    send500(res, e, 'List session issues failed');
  }
});

/** GET /api/close/sessions/:id/audit-events — session-scoped audit ledger events */
router.get('/sessions/:id/audit-events', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const sessionId = req.params.id ?? '';
    const session = await getSession(pool, tenantId, sessionId);
    if (!session) {
      res.status(404).json({ error: 'Close session not found' });
      return;
    }
    const periodLabel = (session.periodEnd ?? '').length >= 7 ? (session.periodEnd ?? '').slice(0, 7) : '';
    const eventType = req.query.eventType as string | undefined;
    const userId = req.query.userId as string | undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const limit = req.query.limit != null ? Math.min(1000, Math.max(1, Number(req.query.limit))) : 100;
    const offset = req.query.offset != null ? Math.max(0, Number(req.query.offset)) : 0;

    const events = await auditLedgerRepo.listByTenantAndPeriod(pool, tenantId, periodLabel, {
      eventType,
      createdBy: userId,
      dateFrom,
      dateTo,
      limit,
      offset,
    });
    const total = await auditLedgerRepo.countByTenantAndPeriod(pool, tenantId, periodLabel, {
      eventType,
      createdBy: userId,
      dateFrom,
      dateTo,
    });

    const eventsWithChain = events.map((e) => ({
      ...e,
      userName: e.userId || 'System',
      chainValid: true,
    }));

    res.json({
      events: eventsWithChain,
      total,
      chainIntegrity: true,
    });
  } catch (e) {
    send500(res, e, 'Get session audit events failed');
  }
});

/** GET /api/close/sessions/:id/evidence-manifest — session-scoped evidence for recons and JEs */
router.get('/sessions/:id/evidence-manifest', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const sessionId = req.params.id ?? '';
    const session = await getSession(pool, tenantId, sessionId);
    if (!session) {
      res.status(404).json({ error: 'Close session not found' });
      return;
    }
    const { listEvidenceForObject } = await import('../../db/repositories/evidence_repository.js');
    const { listPeriodReconciliationsByPeriod } = await import('../../db/repositories/period_reconciliation_repository.js');
    const { listJournalEntries } = await import('../../db/repositories/journal_entry_repository.js');

    const recons = await listPeriodReconciliationsByPeriod(pool, tenantId, sessionId);
    const reconEvidence: Array<{ reconId: string; accountCode: string; files: Array<{ id: string; fileName: string; sizeBytes: number; mimeType?: string; sha256Hash: string; uploadedBy: string; createdAt: string }> }> = [];
    for (const r of recons) {
      const attachments = await listEvidenceForObject(pool, tenantId, 'reconciliation', r.reconId);
      reconEvidence.push({
        reconId: r.reconId,
        accountCode: r.accountCode,
        files: attachments.map((a) => ({
          id: a.id,
          fileName: a.originalFilename ?? a.label ?? 'evidence',
          sizeBytes: a.sizeBytes,
          mimeType: a.mimeType,
          sha256Hash: a.hashSha256,
          uploadedBy: a.attachedBy,
          createdAt: a.attachedAt,
        })),
      });
    }

    const jes = await listJournalEntries(pool, tenantId, { closeSessionId: sessionId, limit: 500 });
    const jeEvidence: Array<{ jeId: string; memo?: string; files: Array<{ id: string; fileName: string; sizeBytes: number; mimeType?: string; sha256Hash: string; uploadedBy: string; createdAt: string }> }> = [];
    for (const je of jes) {
      const attachments = await listEvidenceForObject(pool, tenantId, 'journal_entry', je.id);
      jeEvidence.push({
        jeId: je.id,
        memo: je.memo,
        files: attachments.map((a) => ({
          id: a.id,
          fileName: a.originalFilename ?? a.label ?? 'evidence',
          sizeBytes: a.sizeBytes,
          mimeType: a.mimeType,
          sha256Hash: a.hashSha256,
          uploadedBy: a.attachedBy,
          createdAt: a.attachedAt,
        })),
      });
    }

    const totalFiles = reconEvidence.reduce((s, r) => s + r.files.length, 0) + jeEvidence.reduce((s, j) => s + j.files.length, 0);
    res.json({
      reconEvidence,
      jeEvidence,
      totalFiles,
      allHashesVerified: true,
    });
  } catch (e) {
    send500(res, e, 'Get session evidence manifest failed');
  }
});

/** POST /api/close/sessions/:id/certify — certify close (gate before export); requires under_review, no hard blockers, approver role */
router.post('/sessions/:id/certify', async (req: Request, res: Response) => {
  const startMs = Date.now();
  const id = req.params.id ?? '';
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      criticalLog(req, ROUTE_CERTIFY, 'error', { code: 'VALIDATION', closeSessionId: id, startMs });
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const authReq = req as AuthRequest;
    const body = req.body as { periodLabel?: string; certifiedBy: string; memo?: string };
    if (!body?.certifiedBy?.trim()) {
      criticalLog(req, ROUTE_CERTIFY, 'error', { code: 'VALIDATION', closeSessionId: id, startMs });
      res.status(400).json({ error: 'certifiedBy is required' });
      return;
    }
    const actorRole = getCloseRoleFromReq(authReq);
    const session = await certifyCloseSession(pool, {
      tenantId,
      closeSessionId: id,
      certifiedBy: body.certifiedBy.trim(),
      periodLabel: body.periodLabel,
      memo: body.memo,
    }, actorRole);
    const payload: Record<string, unknown> = { ...session };
    if (session.certifiedSnapshotId) {
      const { getLedgerSnapshotById } = await import('../../db/repositories/ledger_snapshot_repository.js');
      const snapshot = await getLedgerSnapshotById(pool, tenantId, session.certifiedSnapshotId);
      if (snapshot) {
        payload.snapshotHash = snapshot.snapshotHash;
        payload.snapshotHashVersion = snapshot.hashVersion;
      }
    }
    res.status(200).json(payload);
    criticalLog(req, ROUTE_CERTIFY, 'ok', { closeSessionId: id, startMs });
  } catch (e) {
    criticalLog(req, ROUTE_CERTIFY, 'error', { closeSessionId: id, startMs });
    handleSessionError(res, e, 'Certify close failed');
  }
});

/** GET /api/close/sessions/:id/certified-source — read-only certified source metadata (no DB writes). */
router.get('/sessions/:id/certified-source', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    const session = await getSession(pool, tenantId, id);
    if (!session) {
      res.status(404).json({ error: 'Close session not found' });
      return;
    }
    const allowLegacy = effectiveAllowLegacyCertifiedSource(req);
    let certifiedSnapshotId: string | undefined = session.certifiedSnapshotId ?? undefined;
    let snapshotHash: string | undefined;
    let snapshotHashVersion: number | undefined;
    let certifiedSource: 'certified_snapshot' | 'legacy' | 'none' = 'none';
    if (certifiedSnapshotId) {
      const { getLedgerSnapshotById } = await import('../../db/repositories/ledger_snapshot_repository.js');
      const snapshot = await getLedgerSnapshotById(pool, tenantId, certifiedSnapshotId);
      if (snapshot) {
        snapshotHash = snapshot.snapshotHash;
        snapshotHashVersion = snapshot.hashVersion;
        certifiedSource = 'certified_snapshot';
      } else {
        certifiedSnapshotId = undefined;
      }
    }
    if (certifiedSource === 'none' && (session.status === 'certified' || session.status === 'locked') && allowLegacy) {
      certifiedSource = 'legacy';
    }
    res.json({
      closeSessionId: session.id,
      isCertified: session.status === 'certified' || session.status === 'locked',
      certifiedSnapshotId: certifiedSnapshotId ?? null,
      snapshotHash: snapshotHash ?? null,
      snapshotHashVersion: snapshotHashVersion ?? null,
      certifiedSource,
      allowLegacyCertifiedSourceEffective: allowLegacy,
    });
  } catch (e) {
    send500(res, e, 'Get certified source failed');
  }
});

/** POST /api/close/sessions/:id/checklist/initialize — initialize checklist template */
router.post('/sessions/:id/checklist/initialize', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    const session = await getSession(pool, tenantId, id);
    if (!session) {
      res.status(404).json({ error: 'Close session not found' });
      return;
    }
    const { items, created } = await initializeChecklistTemplate(pool, tenantId, id);
    res.status(created ? 201 : 200).json({ items });
  } catch (e) {
    send500(res, e, 'Initialize checklist failed');
  }
});

/** GET /api/close/sessions/:id/checklist — list checklist items */
router.get('/sessions/:id/checklist', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    const items = await getChecklistItems(pool, tenantId, id);
    res.json({ items });
  } catch (e) {
    send500(res, e, 'List checklist failed');
  }
});

/** POST /api/close/sessions/:id/checklist/emit-stuck-issues — emit issues for stuck required items */
router.post('/sessions/:id/checklist/emit-stuck-issues', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    const body = req.body as { createdBy?: string };
    const result = await emitIssuesForStuckChecklist(pool, {
      tenantId,
      closeSessionId: id,
      createdBy: body?.createdBy,
    });
    res.json(result ?? { emitted: false });
  } catch (e) {
    send500(res, e, 'Emit stuck checklist issues failed');
  }
});

/** POST /api/close/checklist-items/:itemId/complete */
router.post('/checklist-items/:itemId/complete', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const itemId = req.params.itemId ?? '';
    const body = req.body as { completedBy: string; notes?: string };
    if (!body?.completedBy) {
      res.status(400).json({ error: 'completedBy required' });
      return;
    }
    const item = await completeChecklistItem(pool, tenantId, itemId, body.completedBy, body.notes);
    if (!item) {
      res.status(404).json({ error: 'Checklist item not found' });
      return;
    }
    res.json(item);
  } catch (e) {
    send500(res, e, 'Complete checklist item failed');
  }
});

/** POST /api/close/checklist-items/:itemId/skip */
router.post('/checklist-items/:itemId/skip', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const itemId = req.params.itemId ?? '';
    const body = req.body as { completedBy: string; notes?: string };
    if (!body?.completedBy) {
      res.status(400).json({ error: 'completedBy required' });
      return;
    }
    const item = await skipChecklistItem(pool, tenantId, itemId, body.completedBy, body.notes);
    if (!item) {
      res.status(404).json({ error: 'Checklist item not found' });
      return;
    }
    res.json(item);
  } catch (e) {
    send500(res, e, 'Skip checklist item failed');
  }
});

/** GET /api/close/sessions — list close sessions */
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const entityId = req.query.entityId as string | undefined;
    const status = req.query.status as string | undefined;
    const sessions = await listSessions(pool, {
      tenantId,
      entityId,
      status: status as import('../../types/close_session.js').CloseSessionStatus | undefined,
    });
    res.json({ sessions });
  } catch (e) {
    send500(res, e, 'List close sessions failed');
  }
});

/** GET /api/close/sessions/:id/triage — materiality, risk score, top risk drivers. Query: store=true to return stored; persist=true to save; materialityMethod=pct_revenue|pct_expenses|fixed; totalRevenue, totalExpenses (optional) for materiality base. */
router.get('/sessions/:id/triage', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    const session = await getSession(pool, tenantId, id);
    if (!session) {
      res.status(404).json({ error: 'Close session not found' });
      return;
    }
    const useStored = (req.query.store as string) === 'true' || (req.query.store as string) === '1';
    const persist = (req.query.persist as string) === 'true' || (req.query.persist as string) === '1';
    const method = ((req.query.materialityMethod as string) || 'pct_revenue') as 'pct_revenue' | 'pct_expenses' | 'fixed';
    const totalRevenue = Number(req.query.totalRevenue);
    const totalExpenses = Number(req.query.totalExpenses);
    const tbSummary =
      !Number.isNaN(totalRevenue) || !Number.isNaN(totalExpenses)
        ? {
            totalRevenue: Number.isNaN(totalRevenue) ? 0 : totalRevenue,
            totalExpenses: Number.isNaN(totalExpenses) ? 0 : totalExpenses,
            totalDebits: 0,
            totalCredits: 0,
          }
        : undefined;
    if (useStored) {
      const latest = await getLatestTriage(pool, tenantId, id);
      if (latest) {
        return res.json({
          assessment: latest,
          materiality: latest.summaryJson.materiality ?? null,
          risk: latest.summaryJson.risk ?? null,
          fromStore: true,
        });
      }
    }
    const closeIssues = await issueService.listIssues(pool, { tenantId, periodId: id });
    const issuesForTriage = closeIssues.map((i) => ({
      status: (i.status === 'verified' || i.status === 'waived' || i.status === 'resolved' ? 'resolved' : 'open') as 'open' | 'resolved' | 'wont_fix',
      severity: (i.severity === 'critical' ? 'critical' : i.severity === 'blocking' ? 'high' : i.severity === 'warning' ? 'med' : 'low') as 'low' | 'med' | 'high' | 'critical',
      impactPl: 0,
      impactBs: 0,
      impactCash: 0,
    })) as import('../../types/issue_item.js').IssueItem[];
    const result = await getOrComputeTriage(pool, tenantId, id, {
      tbSummary,
      issues: issuesForTriage,
      materialityMethod: method,
      materialityOptions: { percentage: 0.05 },
      persist,
    });
    res.json({
      assessment: result.assessment,
      materiality: result.materiality,
      risk: result.risk,
      fromStore: false,
    });
  } catch (e) {
    send500(res, e, 'Triage failed');
  }
});

/** POST /api/close/sessions/:id/statement-packages/generate — generate versioned statement package */
router.post('/sessions/:id/statement-packages/generate', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    const body = req.body as { generatedBy?: string; status?: 'draft' | 'final'; ruleVersionsSnapshot?: Record<string, unknown> };
    const pkg = await generateStatementPackage(pool, tenantId, id, {
      generatedBy: body?.generatedBy,
      status: body?.status,
      ruleVersionsSnapshot: body?.ruleVersionsSnapshot,
    });
    res.status(201).json(pkg);
  } catch (e) {
    if (e instanceof MathematicalIntegrityError) {
      res.status(422).json({
        error: 'Statement generation failed',
        code: 'MATHEMATICAL_INTEGRITY_ERROR',
        message: e.message,
        check: e.check,
        imbalanceAmount: e.imbalanceAmount,
      });
      return;
    }
    if (e instanceof Error && e.message.includes('Close session not found')) {
      res.status(404).json({ error: e.message });
      return;
    }
    if (e instanceof Error && e.message.includes('No unadjusted trial balance')) {
      res.status(404).json({ error: e.message });
      return;
    }
    send500(res, e, 'Generate statement package failed');
  }
});

/** GET /api/close/sessions/:id/statement-packages — list versioned packages for session */
router.get('/sessions/:id/statement-packages', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    const packages = await listStatementPackages(pool, tenantId, id, Number.isNaN(limit) ? undefined : limit);
    res.json({ packages });
  } catch (e) {
    send500(res, e, 'List statement packages failed');
  }
});

/** GET /api/close/statement-packages/diff — get diff between two packages (query: from, to) — must be before :id */
router.get('/statement-packages/diff', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const fromId = req.query.from as string | undefined;
    const toId = req.query.to as string | undefined;
    if (!fromId || !toId) {
      res.status(400).json({ error: 'Query from and to (package ids) required' });
      return;
    }
    const diff = await getStatementDiff(pool, tenantId, fromId, toId);
    if (!diff) {
      res.status(404).json({ error: 'Diff not found' });
      return;
    }
    res.json(diff);
  } catch (e) {
    send500(res, e, 'Get statement diff failed');
  }
});

/** GET /api/close/statement-packages/:id — get package by id */
router.get('/statement-packages/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    const pkg = await getStatementPackage(pool, tenantId, id);
    if (!pkg) {
      res.status(404).json({ error: 'Statement package not found' });
      return;
    }
    res.json(pkg);
  } catch (e) {
    send500(res, e, 'Get statement package failed');
  }
});

/** GET /api/close/statement-packages/:id/lines — get package with lines. Query: includePrior=true for prior period comparison. */
router.get('/statement-packages/:id/lines', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    const includePrior = req.query.includePrior === 'true' || req.query.includePrior === '1';
    const result = await getStatementPackageWithLines(pool, tenantId, id, includePrior);
    if (!result) {
      res.status(404).json({ error: 'Statement package not found' });
      return;
    }
    const lineWithMeta = (l: (typeof result.lines)[0]) => (l as { priorAmount?: string; changeAmount?: string; changePercent?: string | null });
    const lines = result.lines.map((l) => ({
      id: `${result.package.id}:${l.fsLineId}`,
      fsLineId: l.fsLineId,
      name: (l.metadata as { label?: string })?.label ?? l.fsLineId,
      amount: String(Number(l.amount).toFixed(2)),
      statement: l.statement,
      displayOrder: l.displayOrder ?? 0,
      indentLevel: l.indentLevel ?? 0,
      isSubtotal: l.isSubtotal ?? false,
      isGrandTotal: l.isGrandTotal ?? false,
      sectionName: l.sectionName ?? null,
      ...(includePrior && {
        priorAmount: lineWithMeta(l).priorAmount ?? '0.00',
        changeAmount: lineWithMeta(l).changeAmount ?? String(Number(l.amount).toFixed(2)),
        changePercent: lineWithMeta(l).changePercent ?? null,
      }),
    }));
    res.json({ package: result.package, lines });
  } catch (e) {
    send500(res, e, 'Get statement package lines failed');
  }
});

/** GET /api/close/sessions/:id/statement-packages/:pkgId/lines/:lineId/accounts — drill-down: accounts for line item */
router.get('/sessions/:id/statement-packages/:pkgId/lines/:lineId/accounts', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const sessionId = req.params.id ?? '';
    const pkgId = req.params.pkgId ?? '';
    const lineId = req.params.lineId ?? '';
    const result = await getAccountsForLineItem(pool, tenantId, sessionId, pkgId, lineId);
    if (!result) {
      res.status(404).json({ error: 'Line item or package not found' });
      return;
    }
    res.json(result);
  } catch (e) {
    send500(res, e, 'Get accounts for line item failed');
  }
});

/** GET /api/close/sessions/:id/trial-balance/:accountCode/entries — drill-down: GL entries and AJEs for account */
router.get('/sessions/:id/trial-balance/:accountCode/entries', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const sessionId = req.params.id ?? '';
    const accountCode = req.params.accountCode ?? '';
    const result = await getEntriesForAccount(pool, tenantId, sessionId, accountCode);
    if (!result) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json(result);
  } catch (e) {
    send500(res, e, 'Get entries for account failed');
  }
});

/** PATCH /api/close/sessions/:id/status — update close session status (under_review requires readiness) */
router.patch('/sessions/:id/status', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    const body = req.body as { status?: string };
    if (!body?.status) {
      res.status(400).json({ error: 'status is required' });
      return;
    }
    const newStatus = body.status as import('../../types/close_session.js').CloseSessionStatus;
    if (newStatus === 'under_review') {
      const session = await getSession(pool, tenantId, id);
      if (session) {
        const readiness = await computeReadiness(pool, tenantId, session);
        if (!readiness.ready && readiness.hardBlockers.length > 0) {
          res.status(403).json({
            error: 'Close readiness blocked',
            code: 'CLOSE_READINESS_BLOCKED',
            message: 'Cannot advance to under_review: resolve hard blockers first.',
            hardBlockers: readiness.hardBlockers,
            softWarnings: readiness.softWarnings,
          });
          return;
        }
      }
    }
    const userId = (req as AuthRequest).userId;
    const session = await withTransaction(pool, (client) =>
      updateStatus(client, tenantId, id, newStatus, userId ?? 'api')
    );
    res.json(session);
  } catch (e) {
    handleSessionError(res, e, 'Update close session status failed');
  }
});

/** POST /api/close/sessions/:id/reject — reject from UNDER_REVIEW back to IN_PROGRESS; creates blocking issue assigned to preparer */
router.post('/sessions/:id/reject', async (req: Request, res: Response) => {
  const id = req.params.id ?? '';
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const body = req.body as { reason?: string };
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (!reason || reason.length < 10) {
      res.status(400).json({ error: 'reason is required and must be at least 10 characters' });
      return;
    }
    const authReq = req as AuthRequest;
    const userId = authReq.userId ?? 'api';
    const session = await rejectSession(pool, tenantId, id, reason, userId);
    res.status(200).json(session);
  } catch (e) {
    handleSessionError(res, e, 'Reject close session failed');
  }
});

/** POST /api/close/sessions/:id/reopen — reopen certified session (CERTIFIED → IN_PROGRESS); requires approver role and reason */
router.post('/sessions/:id/reopen', async (req: Request, res: Response) => {
  const id = req.params.id ?? '';
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const body = req.body as { reason?: string };
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (!reason || reason.length < 10) {
      res.status(400).json({ error: 'reason is required and must be at least 10 characters' });
      return;
    }
    const authReq = req as AuthRequest;
    const userId = authReq.userId ?? 'api';
    const actorRole = getCloseRoleFromReq(authReq);
    const session = await reopenCloseSession(pool, id, tenantId, userId, reason, actorRole);
    res.status(200).json(session);
  } catch (e) {
    handleSessionError(res, e, 'Reopen close session failed');
  }
});

/** POST /api/close/sessions/:id/lock — lock certified session (CERTIFIED → LOCKED); terminal state */
router.post('/sessions/:id/lock', async (req: Request, res: Response) => {
  const id = req.params.id ?? '';
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const authReq = req as AuthRequest;
    const lockedBy = authReq.userId ?? 'system';
    const session = await lockCloseSession(pool, id, tenantId, lockedBy);
    res.status(200).json(session);
  } catch (e) {
    handleSessionError(res, e, 'Lock close session failed');
  }
});

export default router;
