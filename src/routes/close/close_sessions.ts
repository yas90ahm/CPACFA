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
  CloseSessionError,
} from '../../services/close_session_service.js';
import { withTransaction } from '../../db/transaction.js';
import { getCloseRoleFromReq } from '../../lib/closeRole.js';
import { effectiveAllowLegacyCertifiedSource } from '../../lib/runtime_mode.js';
import type { AuthRequest } from '../../auth/middleware.js';
import { listIssues } from '../../services/issue_item_service.js';
import {
  computeReadiness,
  initializeChecklistTemplate,
  getChecklistItems,
  completeChecklistItem,
  skipChecklistItem,
  emitIssuesForStuckChecklist,
} from '../../services/close_checklist_readiness_service.js';
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
    if (err.code === 'OVERLAP' || err.code === 'INVALID_TRANSITION' || err.code === 'NOT_LOCKED' || err.code === 'HARD_BLOCKERS') {
      res.status(409).json({ error: err.message, code: err.code });
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

/** POST /api/close/sessions/ensure — idempotent ensure session exists for entityId + periodLabel (draft). */
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
      status: body.status as 'draft' | 'in_progress' | 'ready_for_review' | 'finalized' | 'locked' | undefined,
    });
    res.status(created ? 201 : 200).json(session);
  } catch (e) {
    handleSessionError(res, e, 'Create close session failed');
  }
});

/** GET /api/close/sessions/:id — get close session */
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
    res.json(session);
  } catch (e) {
    send500(res, e, 'Get close session failed');
  }
});

/** POST /api/close/sessions/:id/advance — deterministic advance: draft→locked, locked→certified, certified→no-op */
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

/** GET /api/close/sessions/:id/readiness — compute close readiness (hard/soft blockers) */
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
    const readiness = await computeReadiness(pool, tenantId, session);
    res.json(readiness);
  } catch (e) {
    send500(res, e, 'Compute readiness failed');
  }
});

/** POST /api/close/sessions/:id/certify — certify close (gate before export); requires locked, no hard blockers, approver role */
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
    if (certifiedSource === 'none' && session.status === 'certified' && allowLegacy) {
      certifiedSource = 'legacy';
    }
    res.json({
      closeSessionId: session.id,
      isCertified: session.status === 'certified',
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
    const issues = await listIssues(pool, { tenantId, closeSessionId: id });
    const result = await getOrComputeTriage(pool, tenantId, id, {
      tbSummary,
      issues,
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

/** GET /api/close/statement-packages/:id/lines — get package with lines */
router.get('/statement-packages/:id/lines', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    const result = await getStatementPackageWithLines(pool, tenantId, id);
    if (!result) {
      res.status(404).json({ error: 'Statement package not found' });
      return;
    }
    res.json(result);
  } catch (e) {
    send500(res, e, 'Get statement package lines failed');
  }
});

/** PATCH /api/close/sessions/:id/status — update close session status (finalized/locked require readiness) */
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
    const newStatus = body.status as 'draft' | 'in_progress' | 'ready_for_review' | 'finalized' | 'locked';
    if (newStatus === 'finalized' || newStatus === 'locked') {
      const session = await getSession(pool, tenantId, id);
      if (session) {
        const readiness = await computeReadiness(pool, tenantId, session);
        if (!readiness.ready && readiness.hardBlockers.length > 0) {
          res.status(403).json({
            error: 'Close readiness blocked',
            code: 'CLOSE_READINESS_BLOCKED',
            message: 'Cannot finalize or lock: resolve hard blockers first.',
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

export default router;
