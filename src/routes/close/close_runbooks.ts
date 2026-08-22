import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import type { AuthRequest } from '../../auth/middleware.js';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { getCloseRoleFromReq } from '../../lib/closeRole.js';
import {
  approveAndActivateRunbook,
  CloseRunbookError,
  compileAndSaveRunbook,
  getRunbook,
  listRunbooks,
} from '../../services/close_runbook_service.js';
import {
  CanadianAspeProfileError,
  parseCloseFrequency,
} from '../../services/canadian_aspe_close_profile.js';
import { recordAuditLogAction } from '../../services/audit_service.js';
import {
  getRunbookExecutionView,
  instantiateApprovedRunbookForSession,
  resolveRunbookTask,
  RunbookExecutionError,
} from '../../services/runbook_execution_service.js';
import { getSession } from '../../services/close_session_service.js';
import {
  enqueueCloseOrchestratorReconcile,
  ensureCloseOrchestratorRun,
} from '../../services/close_orchestrator_service.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 10 },
});

function handleRunbookError(res: Response, error: unknown): void {
  if (error instanceof CanadianAspeProfileError) {
    res.status(400).json({ error: error.message, code: error.code });
    return;
  }
  if (error instanceof CloseRunbookError) {
    const status = error.code === 'RUNBOOK_NOT_FOUND'
      ? 404
      : error.code === 'RUNBOOK_ALREADY_APPROVED'
        ? 409
        : 422;
    res.status(status).json({ error: error.message, code: error.code });
    return;
  }
  if (error instanceof RunbookExecutionError) {
    const status = error.code.endsWith('NOT_FOUND')
      ? 404
      : error.code === 'RUNBOOK_TASK_FORBIDDEN'
        ? 403
        : 409;
    res.status(status).json({ error: error.message, code: error.code });
    return;
  }
  if (error instanceof multer.MulterError) {
    res.status(400).json({ error: error.message, code: error.code });
    return;
  }
  res.status(500).json({ error: 'Close runbook request failed.' });
}

/** POST /api/close/runbooks/compile — parse, lint, control-gap check, persist draft. */
router.post('/runbooks/compile', (req: Request, res: Response) => {
  upload.single('file')(req, res, async (uploadError: unknown) => {
    if (uploadError) {
      handleRunbookError(res, uploadError);
      return;
    }
    try {
      const authReq = req as AuthRequest;
      const tenantId = getTenantId(req);
      const pool = getTenantPool(req);
      if (!tenantId || !pool) {
        res.status(400).json({ error: 'Tenant context required.' });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: 'A runbook file is required.' });
        return;
      }
      const entityId = typeof req.body?.entityId === 'string' ? req.body.entityId : '';
      const name = typeof req.body?.name === 'string' ? req.body.name : req.file.originalname;
      const frequency = parseCloseFrequency(req.body?.frequency, 'monthly');
      const createdBy = authReq.userId ?? 'system:runbook-upload';
      const runbook = await compileAndSaveRunbook(pool, {
        tenantId,
        entityId,
        name,
        frequency,
        filename: req.file.originalname,
        mimeType: req.file.mimetype || 'application/octet-stream',
        buffer: req.file.buffer,
        createdBy,
      });
      await recordAuditLogAction(pool, tenantId, {
        action: 'close_runbook_compiled',
        resource: `close_runbook:${runbook.id}`,
        actor: createdBy,
        detail: `Compiled ${runbook.sourceFilename} as ${runbook.name} v${runbook.version}; executable=${runbook.compiledPlan.executable}`,
      });
      res.status(201).json({ runbook });
    } catch (error) {
      handleRunbookError(res, error);
    }
  });
});

/** GET /api/close/runbooks — entity-scoped runbook versions. */
router.get('/runbooks', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required.' });
      return;
    }
    const entityId = typeof req.query.entityId === 'string' ? req.query.entityId : undefined;
    const frequency = req.query.frequency ? parseCloseFrequency(req.query.frequency) : undefined;
    const runbooks = await listRunbooks(pool, tenantId, { entityId, frequency });
    res.json({ runbooks });
  } catch (error) {
    handleRunbookError(res, error);
  }
});

/** POST /api/close/runbooks/:id/approve — controller approves and activates one immutable version. */
router.post('/runbooks/:id/approve', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required.' });
      return;
    }
    if (getCloseRoleFromReq(authReq) !== 'approver') {
      res.status(403).json({ error: 'Only a controller or approver may activate a close runbook.' });
      return;
    }
    const approvedBy = authReq.userId ?? 'system:runbook-approver';
    const runbook = await approveAndActivateRunbook(pool, tenantId, req.params.id ?? '', approvedBy);
    await recordAuditLogAction(pool, tenantId, {
      action: 'close_runbook_approved',
      resource: `close_runbook:${runbook.id}`,
      actor: approvedBy,
      detail: `Approved and activated ${runbook.name} v${runbook.version}`,
    });
    res.json({ runbook });
  } catch (error) {
    handleRunbookError(res, error);
  }
});

/** GET /api/close/runbooks/:id — compiled plan; source bytes are never returned. */
router.get('/runbooks/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required.' });
      return;
    }
    const runbook = await getRunbook(pool, tenantId, req.params.id ?? '');
    if (!runbook) {
      res.status(404).json({ error: 'Close runbook not found.' });
      return;
    }
    res.json({ runbook });
  } catch (error) {
    handleRunbookError(res, error);
  }
});

/** GET /api/close/runbook-executions/session/:sessionId — live task graph and outcomes. */
router.get('/runbook-executions/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required.' });
      return;
    }
    const view = await getRunbookExecutionView(pool, tenantId, req.params.sessionId ?? '');
    if (!view) {
      res.status(404).json({ error: 'No runbook execution exists for this close session.' });
      return;
    }
    res.json(view);
  } catch (error) {
    handleRunbookError(res, error);
  }
});

/** POST /api/close/runbook-executions/session/:sessionId/start — catch-up start for an existing close. */
router.post('/runbook-executions/session/:sessionId/start', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required.' });
      return;
    }
    const actorRole = getCloseRoleFromReq(authReq);
    if (!['reviewer', 'approver'].includes(actorRole)) {
      res.status(403).json({ error: 'Reviewer or approver authority is required to start a runbook.' });
      return;
    }
    const closeSessionId = req.params.sessionId ?? '';
    const session = await getSession(pool, tenantId, closeSessionId);
    if (!session) {
      res.status(404).json({ error: 'Close session not found.' });
      return;
    }
    if (session.standard.toUpperCase() !== 'ASPE' || session.basis !== 'accrual') {
      res.status(409).json({
        error: 'The Canadian ASPE runbook requires an ASPE accrual-basis close session.',
        code: 'RUNBOOK_SESSION_PROFILE_MISMATCH',
      });
      return;
    }
    if (session.status !== 'in_progress') {
      res.status(409).json({
        error: `A runbook can start only while the close is in progress; current status is ${session.status}.`,
      });
      return;
    }
    const frequency = parseCloseFrequency(req.body?.frequency, 'monthly');
    const execution = await instantiateApprovedRunbookForSession(pool, {
      tenantId,
      entityId: session.entityId,
      closeSessionId,
      frequency,
    });
    if (!execution) {
      res.status(409).json({
        error: `No approved active ${frequency} runbook exists for entity ${session.entityId}.`,
        code: 'RUNBOOK_ACTIVE_VERSION_REQUIRED',
      });
      return;
    }
    await ensureCloseOrchestratorRun(pool, tenantId, closeSessionId);
    await enqueueCloseOrchestratorReconcile({
      tenantId,
      closeSessionId,
      trigger: 'close_started',
      sourceType: 'close_session',
      sourceId: closeSessionId,
    });
    const view = await getRunbookExecutionView(pool, tenantId, closeSessionId);
    res.status(201).json(view);
  } catch (error) {
    handleRunbookError(res, error);
  }
});

/** PATCH /api/close/runbook-task-executions/:taskId — signed human disposition or retry. */
router.patch('/runbook-task-executions/:taskId', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required.' });
      return;
    }
    const action = req.body?.action;
    if (!['complete', 'skip', 'retry'].includes(action)) {
      res.status(400).json({ error: 'action must be complete, skip, or retry.' });
      return;
    }
    const task = await resolveRunbookTask(pool, {
      tenantId,
      taskExecutionId: req.params.taskId ?? '',
      action,
      actor: authReq.userId ?? 'system:runbook-reviewer',
      actorRole: getCloseRoleFromReq(authReq),
      notes: typeof req.body?.notes === 'string' ? req.body.notes : undefined,
    });
    res.json({ task });
  } catch (error) {
    handleRunbookError(res, error);
  }
});

export default router;
