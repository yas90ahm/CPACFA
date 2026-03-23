/**
 * Debt interest accrual routes.
 * Mounted at /api/close via close/index.ts.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { send500 } from '../../lib/errorHandler.js';
import { guardSessionWritable } from '../../lib/session_write_guard.js';
import { getCloseSessionById } from '../../db/repositories/close_session_repository.js';
import {
  getDebtSchedules,
  getDebtAccrualEntries,
  createDebtSchedule,
  updateDebtSchedule,
  proposeInterestAccruals,
} from '../../services/debt_accrual_service.js';

const router = Router();

/** GET /sessions/:sessionId/debt-accrual — List schedules + accrual entries for session. */
router.get('/sessions/:sessionId/debt-accrual', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const session = await getCloseSessionById(pool, tenantId, req.params.sessionId!);
    if (!session) { res.status(404).json({ error: 'Close session not found' }); return; }
    const schedules = await getDebtSchedules(pool, tenantId, String(session.entityId));
    const entries = await getDebtAccrualEntries(pool, tenantId, req.params.sessionId!);
    res.json({ schedules, entries });
  } catch (e) {
    send500(res, e, 'List debt accrual failed');
  }
});

/** POST /entities/:entityId/debt-schedules — Create a debt schedule. */
router.post('/entities/:entityId/debt-schedules', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const { entityId } = req.params;
    const schedule = await createDebtSchedule(pool, tenantId, entityId!, req.body);
    res.status(201).json({ schedule });
  } catch (e) {
    send500(res, e, 'Create debt schedule failed');
  }
});

/** PUT /debt-schedules/:id — Update a debt schedule. */
router.put('/debt-schedules/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const schedule = await updateDebtSchedule(pool, tenantId, req.params.id!, req.body);
    if (!schedule) { res.status(404).json({ error: 'Debt schedule not found' }); return; }
    res.json({ schedule });
  } catch (e) {
    send500(res, e, 'Update debt schedule failed');
  }
});

/** POST /sessions/:sessionId/debt-accrual/propose — Propose interest accruals for session period. */
router.post('/sessions/:sessionId/debt-accrual/propose', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const { sessionId } = req.params;
    if (!await guardSessionWritable(res, pool, tenantId, sessionId!)) return;
    const session = await getCloseSessionById(pool, tenantId, sessionId!);
    if (!session) { res.status(404).json({ error: 'Close session not found' }); return; }
    const entries = await proposeInterestAccruals(
      pool, tenantId, String(session.entityId), sessionId!,
      String(session.periodStart), String(session.periodEnd)
    );
    res.status(201).json({ entries });
  } catch (e) {
    send500(res, e, 'Propose debt accruals failed');
  }
});

export default router;
