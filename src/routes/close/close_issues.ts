/**
 * Issue (Exception) routes: CRUD + filtering.
 * Mounted at /api/close/issues.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { send500 } from '../../lib/errorHandler.js';
import {
  createIssue,
  getIssue,
  listIssues,
  resolveIssue,
  assignIssue,
  updateIssueStatus,
  IssueItemError,
} from '../../services/issue_item_service.js';
import type { IssueCategory, IssueSeverity, IssueStatus } from '../../types/issue_item.js';

const router = Router();

const CATEGORIES: IssueCategory[] = [
  'intake', 'classification', 'reconciliation', 'posting', 'policy', 'presentation', 'export_blocker',
];
const SEVERITIES: IssueSeverity[] = ['low', 'med', 'high', 'critical'];
const STATUSES: IssueStatus[] = ['open', 'in_progress', 'needs_info', 'needs_approval', 'resolved', 'wont_fix'];

function handleIssueError(res: Response, err: unknown, fallbackLabel: string): void {
  if (err instanceof IssueItemError) {
    if (err.code === 'NOT_FOUND') {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err.code === 'VALIDATION' || err.code === 'INVALID_STATUS') {
      res.status(400).json({ error: err.message });
      return;
    }
  }
  send500(res, err, fallbackLabel);
}

function parseBodyCreate(req: Request): { ok: true; input: Parameters<typeof createIssue>[1] } | { ok: false; error: string } {
  const b = req.body as Record<string, unknown>;
  const closeSessionId = b?.closeSessionId as string | undefined;
  const title = b?.title as string | undefined;
  const category = b?.category as string | undefined;
  const severity = b?.severity as string | undefined;
  if (!closeSessionId || !title) return { ok: false, error: 'closeSessionId and title are required' };
  if (!CATEGORIES.includes(category as IssueCategory)) return { ok: false, error: `category must be one of: ${CATEGORIES.join(', ')}` };
  if (!SEVERITIES.includes(severity as IssueSeverity)) return { ok: false, error: `severity must be one of: ${SEVERITIES.join(', ')}` };
  const tenantId = getTenantId(req);
  if (!tenantId) return { ok: false, error: 'Tenant context required' };
  return {
    ok: true,
    input: {
      closeSessionId,
      tenantId,
      category: category as IssueCategory,
      severity: (severity as IssueSeverity) ?? 'med',
      title,
      description: b?.description as string | undefined,
      impactPl: b?.impactPl as number | undefined,
      impactBs: b?.impactBs as number | undefined,
      impactCash: b?.impactCash as number | undefined,
      currency: b?.currency as string | undefined,
      materialityEstimate: b?.materialityEstimate as number | undefined,
      materialityThresholdUsed: b?.materialityThresholdUsed as number | undefined,
      confidenceScore: b?.confidenceScore as number | undefined,
      sourceRef: b?.sourceRef as Record<string, unknown> | undefined,
      assignedTo: b?.assignedTo as string | undefined,
      dueDate: b?.dueDate as string | undefined,
      createdBy: (req as { userId?: string }).userId as string | undefined,
      status: STATUSES.includes(b?.status as IssueStatus) ? (b.status as IssueStatus) : undefined,
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
    const issue = await createIssue(pool, parsed.input);
    res.status(201).json(issue);
  } catch (e) {
    handleIssueError(res, e, 'Create issue failed');
  }
});

/** GET /api/close/issues/:id — get issue */
router.get('/issues/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    const issue = await getIssue(pool, tenantId, id);
    if (!issue) {
      res.status(404).json({ error: 'Issue not found' });
      return;
    }
    res.json(issue);
  } catch (e) {
    send500(res, e, 'Get issue failed');
  }
});

/** GET /api/close/issues — list issues with filters */
router.get('/issues', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const q = req.query as Record<string, string | undefined>;
    const closeSessionId = q.closeSessionId;
    const category = q.category as IssueCategory | undefined;
    const severity = q.severity as IssueSeverity | undefined;
    const status = q.status as IssueStatus | undefined;
    const assignedTo = q.assignedTo;
    if (category && !CATEGORIES.includes(category)) {
      res.status(400).json({ error: `category must be one of: ${CATEGORIES.join(', ')}` });
      return;
    }
    if (severity && !SEVERITIES.includes(severity)) {
      res.status(400).json({ error: `severity must be one of: ${SEVERITIES.join(', ')}` });
      return;
    }
    if (status && !STATUSES.includes(status)) {
      res.status(400).json({ error: `status must be one of: ${STATUSES.join(', ')}` });
      return;
    }
    const issues = await listIssues(pool, {
      tenantId,
      closeSessionId,
      category,
      severity,
      status,
      assignedTo,
    });
    res.json({ issues });
  } catch (e) {
    send500(res, e, 'List issues failed');
  }
});

/** PATCH /api/close/issues/:id/status — update status (open, in_progress, needs_info, needs_approval, resolved, wont_fix) */
router.patch('/issues/:id/status', async (req: Request, res: Response) => {
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
    if (body.status === 'resolved' || body.status === 'wont_fix') {
      const issue = await resolveIssue(pool, tenantId, id, body.status, (req as { userId?: string }).userId);
      res.json(issue);
      return;
    }
    if (!STATUSES.includes(body.status as IssueStatus)) {
      res.status(400).json({ error: `status must be one of: ${STATUSES.join(', ')}` });
      return;
    }
    const issue = await updateIssueStatus(pool, tenantId, id, body.status as IssueStatus, (req as { userId?: string }).userId);
    res.json(issue);
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
    const body = req.body as { assignedTo?: string | null; dueDate?: string | null };
    const issue = await assignIssue(
      pool,
      tenantId,
      id,
      body.assignedTo ?? null,
      body.dueDate ?? undefined,
      (req as { userId?: string }).userId
    );
    res.json(issue);
  } catch (e) {
    handleIssueError(res, e, 'Assign issue failed');
  }
});

export default router;
