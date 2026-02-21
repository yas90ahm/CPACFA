/**
 * Variance analysis routes: list, explain, approve.
 * Mounted at /api/close.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { send500 } from '../../lib/errorHandler.js';
import * as varianceService from '../../services/variance_analysis_service.js';
import * as repo from '../../db/repositories/variance_analysis_repository.js';

const router = Router();

/** GET /api/close/sessions/:closeSessionId/variances — list variances for session */
router.get('/sessions/:closeSessionId/variances', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const closeSessionId = req.params.closeSessionId;
    const variances = await repo.listVariancesForSession(pool, tenantId, closeSessionId);
    res.json({ variances });
  } catch (e) {
    send500(res, e, 'List variances failed');
  }
});

/** GET /api/close/variances/:id/ai-draft — get AI draft explanation (cached or generate fallback) */
router.get('/variances/:id/ai-draft', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id;
    const result = await varianceService.getVarianceAiDraft(pool, tenantId, id);
    res.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('not found')) {
      res.status(404).json({ error: 'Variance not found' });
      return;
    }
    send500(res, e, 'Get variance AI draft failed');
  }
});

/** POST /api/close/variances/:id/explain — add human explanation */
router.post('/variances/:id/explain', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id;
    const body = req.body as { explanation: string };
    if (typeof body.explanation !== 'string') {
      res.status(400).json({ error: 'explanation string required' });
      return;
    }
    const variance = await varianceService.explainVariance(pool, tenantId, id, body.explanation);
    if (!variance) {
      res.status(404).json({ error: 'Variance not found' });
      return;
    }
    res.json({ variance });
  } catch (e) {
    send500(res, e, 'Explain variance failed');
  }
});

/** POST /api/close/variances/:id/approve — approve variance */
router.post('/variances/:id/approve', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id;
    const body = req.body as { approvedBy?: string };
    const approvedBy = body.approvedBy ?? (req as { user?: { email?: string } }).user?.email ?? 'unknown';
    const variance = await varianceService.approveVariance(pool, tenantId, id, approvedBy);
    if (!variance) {
      res.status(404).json({ error: 'Variance not found' });
      return;
    }
    res.json({ variance });
  } catch (e) {
    send500(res, e, 'Approve variance failed');
  }
});

/** GET /api/close/sessions/:closeSessionId/variance-status — gate status */
router.get('/sessions/:closeSessionId/variance-status', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const closeSessionId = req.params.closeSessionId;
    const result = await varianceService.checkVarianceCompleteness(pool, tenantId, closeSessionId);
    res.json(result);
  } catch (e) {
    send500(res, e, 'Get variance status failed');
  }
});

export default router;
