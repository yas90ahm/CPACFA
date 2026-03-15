/**
 * Budget routes: upload, retrieve, and variance analysis.
 * Mounted at /api/close.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { send500 } from '../../lib/errorHandler.js';
import { getCloseSessionById } from '../../db/repositories/close_session_repository.js';
import { guardSessionWritable } from '../../lib/session_write_guard.js';
import * as budgetService from '../../services/budget_service.js';

const router = Router();

/**
 * POST /api/close/sessions/:sessionId/budget/upload — upload budget CSV for the session's period.
 * Body: { csvContent: string }
 */
router.post('/sessions/:sessionId/budget/upload', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }

    const sessionId = req.params.sessionId;
    if (!await guardSessionWritable(res, pool, tenantId, sessionId)) return;

    const session = await getCloseSessionById(pool, tenantId, sessionId);
    if (!session) {
      res.status(404).json({ error: 'Close session not found' });
      return;
    }

    const body = req.body as { csvContent?: string };
    if (typeof body.csvContent !== 'string' || !body.csvContent.trim()) {
      res.status(400).json({ error: 'csvContent string required' });
      return;
    }

    const periodLabel = session.periodEnd.length >= 7 ? session.periodEnd.slice(0, 7) : session.periodEnd;
    const uploadedBy = (req as { user?: { email?: string } }).user?.email ?? undefined;

    const entries = await budgetService.uploadBudget(
      pool, tenantId, session.entityId, periodLabel, body.csvContent, uploadedBy
    );

    res.json({ entries, count: entries.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('CSV must have')) {
      res.status(400).json({ error: msg });
      return;
    }
    if (msg.includes('No valid budget')) {
      res.status(400).json({ error: msg });
      return;
    }
    send500(res, e, 'Upload budget failed');
  }
});

/**
 * GET /api/close/sessions/:sessionId/budget — list budget entries for the session's period.
 */
router.get('/sessions/:sessionId/budget', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }

    const sessionId = req.params.sessionId;
    const session = await getCloseSessionById(pool, tenantId, sessionId);
    if (!session) {
      res.status(404).json({ error: 'Close session not found' });
      return;
    }

    const periodLabel = session.periodEnd.length >= 7 ? session.periodEnd.slice(0, 7) : session.periodEnd;
    const entries = await budgetService.getBudgetForPeriod(pool, tenantId, session.entityId, periodLabel);

    res.json({ entries, count: entries.length });
  } catch (e) {
    send500(res, e, 'Get budget failed');
  }
});

/**
 * GET /api/close/sessions/:sessionId/budget/variance — budget-to-actual variance.
 */
router.get('/sessions/:sessionId/budget/variance', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }

    const sessionId = req.params.sessionId;
    const session = await getCloseSessionById(pool, tenantId, sessionId);
    if (!session) {
      res.status(404).json({ error: 'Close session not found' });
      return;
    }

    const periodLabel = session.periodEnd.length >= 7 ? session.periodEnd.slice(0, 7) : session.periodEnd;
    const items = await budgetService.getBudgetVariance(pool, tenantId, session.entityId, sessionId, periodLabel);

    res.json({ items, count: items.length });
  } catch (e) {
    send500(res, e, 'Get budget variance failed');
  }
});

export default router;
