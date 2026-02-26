/**
 * Issue (Exception) routes: CRUD + filtering.
 * Mounted at /api/close/issues.
 * Single issue store: tenant_close_issues via issue_service.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { send500 } from '../../lib/errorHandler.js';
import type { CreateIssueForSessionInput } from '../../services/issue_service.js';
import * as issueService from '../../services/issue_service.js';
import * as issueDetection from '../../services/issue_detection_service.js';

const router = Router();

const CATEGORIES = [
  'intake', 'classification', 'reconciliation', 'posting', 'policy', 'presentation', 'export_blocker',
] as const;
const SEVERITIES = ['low', 'med', 'high', 'critical'] as const;

function handleIssueError(res: Response, err: unknown, fallbackLabel: string): void {
  if (err instanceof issueService.IssueServiceError) {
    if (err.code === 'NOT_FOUND') {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err.code === 'VALIDATION' || err.code === 'INVALID_STATUS' || err.code === 'CANNOT_WAIVE') {
      res.status(400).json({ error: err.message });
      return;
    }
  }
  send500(res, err, fallbackLabel);
}

function parseBodyCreate(req: Request): { ok: true; input: CreateIssueForSessionInput } | { ok: false; error: string } {
  const b = req.body as Record<string, unknown>;
  const closeSessionId = b?.closeSessionId as string | undefined;
  const title = b?.title as string | undefined;
  const category = b?.category as string | undefined;
  const severity = b?.severity as string | undefined;
  if (!closeSessionId || !title) return { ok: false, error: 'closeSessionId and title are required' };
  if (!CATEGORIES.includes(category as (typeof CATEGORIES)[number])) return { ok: false, error: `category must be one of: ${CATEGORIES.join(', ')}` };
  if (!SEVERITIES.includes(severity as (typeof SEVERITIES)[number])) return { ok: false, error: `severity must be one of: ${SEVERITIES.join(', ')}` };
  const tenantId = getTenantId(req);
  if (!tenantId) return { ok: false, error: 'Tenant context required' };
  return {
    ok: true,
    input: {
      closeSessionId,
      tenantId,
      category: category as string,
      severity: (severity as string) ?? 'med',
      title,
      description: b?.description as string | undefined,
      sourceRef: b?.sourceRef as Record<string, unknown> | undefined,
      createdBy: (req as { userId?: string }).userId as string | undefined,
    },
  };
}

/** POST /api/close/issues — create issue */
router.post('/issues', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const parsed = parseBodyCreate(req);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const issue = await issueService.createIssueForSession(pool, parsed.input);
    res.status(201).json(issue);
  } catch (e) {
    handleIssueError(res, e, 'Create issue failed');
  }
});

// Unified issue routes (must be before /issues/:id so /issues/summary and /issues/detect match)
/** GET /api/close/issues/summary — issue counts by severity/status for period */
router.get('/issues/summary', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const periodId = (req.query as { period_id?: string }).period_id;
    if (!tenantId || !pool || !periodId) {
      res.status(400).json({ error: 'Tenant context and period_id required' });
      return;
    }
    const summary = await issueService.getIssueSummaryForPeriod(pool, periodId, tenantId);
    res.json(summary);
  } catch (e) {
    send500(res, e, 'Get issue summary failed');
  }
});

/** POST /api/close/issues/detect — run detection sweep for period */
router.post('/issues/detect', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const periodId = (req.query as { period_id?: string }).period_id;
    if (!tenantId || !pool || !periodId) {
      res.status(400).json({ error: 'Tenant context and period_id required' });
      return;
    }
    const ctx: issueDetection.DetectionContext = { pool, tenantId, periodId };
    const unmapped = await issueDetection.detectUnmappedAccounts(ctx);
    const bs = await issueDetection.detectBalanceSheetImbalance(ctx);
    const pendingTemplates = await issueDetection.detectPendingAjeTemplates(ctx);
    const unexplainedVariances = await issueDetection.detectUnexplainedVariances(ctx);
    res.json({
      unmapped: unmapped.length,
      balanceSheetImbalance: bs.length,
      pendingTemplates: pendingTemplates.length,
      unexplainedVariances: unexplainedVariances.length,
    });
  } catch (e) {
    send500(res, e, 'Detect issues failed');
  }
});

/** GET /api/close/issues — list issues (period_id or closeSessionId required) */
router.get('/issues', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const q = req.query as Record<string, string | undefined>;
    const periodId = q.period_id ?? q.closeSessionId;
    if (!periodId) {
      res.status(400).json({ error: 'period_id or closeSessionId query required' });
      return;
    }
    const status = q.status as import('../../types/close_issue.js').CloseIssueStatus | undefined;
    const severity = q.severity;
    const category = q.category;
    const issueType = q.issueType;
    const issues = await issueService.listIssues(pool, {
      tenantId,
      periodId,
      status,
      severity,
      category,
      issueType,
    });
    res.json({ issues });
  } catch (e) {
    send500(res, e, 'List issues failed');
  }
});

/** GET /api/close/issues/:id — get issue with history */
router.get('/issues/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    const issue = await issueService.getIssue(pool, tenantId, id);
    if (!issue) {
      res.status(404).json({ error: 'Issue not found' });
      return;
    }
    const history = await issueService.getIssueHistory(pool, id);
    res.json({ ...issue, history });
  } catch (e) {
    send500(res, e, 'Get issue failed');
  }
});

/** PATCH /api/close/issues/:id/status — update status (in_progress → startProgress; resolved|wont_fix → resolve with description) */
router.patch('/issues/:id/status', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    const body = req.body as { status?: string; resolutionDescription?: string };
    if (!body?.status) {
      res.status(400).json({ error: 'status is required' });
      return;
    }
    const userId = (req as { userId?: string }).userId ?? 'api';
    if (body.status === 'resolved' || body.status === 'wont_fix') {
      const issue = await issueService.resolveIssue(pool, tenantId, id, {
        resolutionType: 'acknowledged_with_justification',
        resolutionDescription: body.resolutionDescription?.trim() || (body.status === 'wont_fix' ? 'Waived via status update' : 'Resolved via status update'),
        resolvedBy: userId,
      });
      res.json(issue);
      return;
    }
    if (body.status === 'in_progress') {
      const issue = await issueService.startProgress(pool, tenantId, id, userId);
      res.json(issue);
      return;
    }
    res.status(400).json({
      error: `status must be one of: in_progress, resolved, wont_fix. For assign use PATCH /issues/:id/assign.`,
    });
  } catch (e) {
    handleIssueError(res, e, 'Update issue status failed');
  }
});

/** PATCH /api/close/issues/:id/assign — assign issue */
router.patch('/issues/:id/assign', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    const body = req.body as { assignedTo?: string | null };
    const assignedTo = body.assignedTo ?? null;
    if (assignedTo == null || String(assignedTo).trim() === '') {
      res.status(400).json({ error: 'assignedTo required' });
      return;
    }
    const assignedBy = (req as { userId?: string }).userId ?? 'api';
    const issue = await issueService.assignIssue(pool, tenantId, id, String(assignedTo).trim(), assignedBy);
    res.json(issue);
  } catch (e) {
    handleIssueError(res, e, 'Assign issue failed');
  }
});

// --- Unified issue actions (tenant_close_issues) ---

/** POST /api/close/issues/:id/assign — assign unified issue to user */
router.post('/issues/:id/assign', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    const body = req.body as { assignedTo?: string };
    if (!body?.assignedTo?.trim()) {
      res.status(400).json({ error: 'assignedTo required' });
      return;
    }
    const assignedBy = (req as { userId?: string }).userId ?? 'api';
    const issue = await issueService.assignIssue(pool, tenantId, id, body.assignedTo.trim(), assignedBy);
    res.json(issue);
  } catch (e) {
    handleIssueError(res, e, 'Assign issue failed');
  }
});

/** POST /api/close/issues/:id/start — mark issue in progress (unified) */
router.post('/issues/:id/start', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    const userId = (req as { userId?: string }).userId ?? 'api';
    const issue = await issueService.startProgress(pool, tenantId, id, userId);
    res.json(issue);
  } catch (e) {
    handleIssueError(res, e, 'Start issue failed');
  }
});

/** POST /api/close/issues/:id/resolve — resolve with type + description (unified) */
router.post('/issues/:id/resolve', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    const body = req.body as {
      resolutionType?: string;
      resolutionDescription?: string;
      resolutionAjeId?: string | null;
      resolutionReconId?: string | null;
    };
    if (!body?.resolutionType || !body?.resolutionDescription) {
      res.status(400).json({ error: 'resolutionType and resolutionDescription required' });
      return;
    }
    const userId = (req as { userId?: string }).userId ?? 'api';
    const issue = await issueService.resolveIssue(pool, tenantId, id, {
      resolutionType: body.resolutionType as import('../../types/close_issue.js').ResolutionType,
      resolutionDescription: body.resolutionDescription,
      resolvedBy: userId,
      resolutionAjeId: body.resolutionAjeId ?? null,
      resolutionReconId: body.resolutionReconId ?? null,
    });
    res.json(issue);
  } catch (e) {
    handleIssueError(res, e, 'Resolve issue failed');
  }
});

/** POST /api/close/issues/:id/verify — manually verify (unified) */
router.post('/issues/:id/verify', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    const body = (req.body as { method?: string }) ?? {};
    const userId = (req as { userId?: string }).userId ?? 'api';
    const issue = await issueService.verifyIssue(
      pool,
      tenantId,
      id,
      userId,
      (body.method === 'manual_review' ? 'manual_review' : 'automatic_recheck') as 'manual_review' | 'automatic_recheck'
    );
    res.json(issue);
  } catch (e) {
    handleIssueError(res, e, 'Verify issue failed');
  }
});

/** POST /api/close/issues/:id/waive — waive with justification (warning/info only, unified) */
router.post('/issues/:id/waive', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    const body = req.body as { justification?: string };
    if (!body?.justification?.trim()) {
      res.status(400).json({ error: 'justification required' });
      return;
    }
    const userId = (req as { userId?: string }).userId ?? 'api';
    const issue = await issueService.waiveIssue(pool, tenantId, id, body.justification.trim(), userId);
    res.json(issue);
  } catch (e) {
    handleIssueError(res, e, 'Waive issue failed');
  }
});

/** POST /api/close/issues/:id/reopen — reopen with reason (unified) */
router.post('/issues/:id/reopen', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    const body = req.body as { reason?: string };
    if (!body?.reason?.trim()) {
      res.status(400).json({ error: 'reason required' });
      return;
    }
    const userId = (req as { userId?: string }).userId ?? 'api';
    const issue = await issueService.reopenIssue(pool, tenantId, id, body.reason.trim(), userId);
    res.json(issue);
  } catch (e) {
    handleIssueError(res, e, 'Reopen issue failed');
  }
});

export default router;
