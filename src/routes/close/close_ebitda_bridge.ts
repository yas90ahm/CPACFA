/**
 * EBITDA bridge routes: compute bridge, manage addbacks.
 * Mounted at /api/close.
 */

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { send500 } from '../../lib/errorHandler.js';
import { getCloseSessionById } from '../../db/repositories/close_session_repository.js';
import { guardSessionWritable } from '../../lib/session_write_guard.js';
import * as ebitdaBridgeService from '../../services/ebitda_bridge_service.js';
import * as addbackRepo from '../../db/repositories/ebitda_addbacks_repository.js';

const router = Router();

/**
 * GET /api/close/sessions/:sessionId/ebitda-bridge — compute full EBITDA bridge.
 */
router.get('/sessions/:sessionId/ebitda-bridge', async (req: Request, res: Response) => {
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

    const bridge = await ebitdaBridgeService.computeEBITDABridge(pool, tenantId, sessionId);
    res.json({ bridge });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('No statement package found')) {
      res.status(400).json({ error: msg });
      return;
    }
    send500(res, e, 'Compute EBITDA bridge failed');
  }
});

/**
 * POST /api/close/sessions/:sessionId/ebitda-addbacks — create a new addback.
 * Body: { label: string, amount: number, category?: string }
 */
router.post('/sessions/:sessionId/ebitda-addbacks', async (req: Request, res: Response) => {
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

    const body = req.body as { label?: string; amount?: number; category?: string };
    if (typeof body.label !== 'string' || !body.label.trim()) {
      res.status(400).json({ error: 'label string required' });
      return;
    }
    if (typeof body.amount !== 'number' || !Number.isFinite(body.amount)) {
      res.status(400).json({ error: 'amount (number) required' });
      return;
    }

    const periodLabel = session.periodEnd.length >= 7 ? session.periodEnd.slice(0, 7) : session.periodEnd;
    const createdBy = (req as { user?: { email?: string } }).user?.email ?? undefined;

    const addback = await addbackRepo.insertAddback(pool, {
      id: randomUUID(),
      tenantId,
      entityId: session.entityId,
      periodLabel,
      closeSessionId: sessionId,
      label: body.label.trim(),
      amount: body.amount,
      category: body.category?.trim() || 'other',
      createdBy,
    });

    res.status(201).json({ addback });
  } catch (e) {
    send500(res, e, 'Create EBITDA addback failed');
  }
});

/**
 * DELETE /api/close/sessions/:sessionId/ebitda-addbacks/:addbackId — delete an addback.
 */
router.delete('/sessions/:sessionId/ebitda-addbacks/:addbackId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }

    const sessionId = req.params.sessionId;
    if (!await guardSessionWritable(res, pool, tenantId, sessionId)) return;

    const addbackId = req.params.addbackId;

    // Verify addback belongs to this session
    const existing = await addbackRepo.getAddbackById(pool, tenantId, addbackId);
    if (!existing) {
      res.status(404).json({ error: 'Addback not found' });
      return;
    }
    if (existing.closeSessionId !== sessionId) {
      res.status(404).json({ error: 'Addback not found for this session' });
      return;
    }

    await addbackRepo.deleteAddback(pool, tenantId, addbackId);
    res.json({ deleted: true, id: addbackId });
  } catch (e) {
    send500(res, e, 'Delete EBITDA addback failed');
  }
});

export default router;
