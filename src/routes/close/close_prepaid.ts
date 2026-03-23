/**
 * Prepaid amortization routes — schedule CRUD, propose amortization entries.
 * Mounted at /api/close via close/index.ts.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { send500 } from '../../lib/errorHandler.js';
import { guardSessionWritable } from '../../lib/session_write_guard.js';
import {
  createSchedule,
  getSchedulesForEntity,
  getEntriesForSchedule,
  proposeAmortizationEntries,
  updateScheduleAfterPosting,
} from '../../services/prepaid_amortization_service.js';

const router = Router();

/** GET /sessions/:sessionId/prepaids — List prepaid schedules. */
router.get('/sessions/:sessionId/prepaids', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const includeFullyAmortized = req.query.includeFullyAmortized === 'true';
    const schedules = await getSchedulesForEntity(pool, tenantId, req.params.sessionId!, includeFullyAmortized);
    res.json({ schedules });
  } catch (e) { send500(res, e, 'List prepaid schedules failed'); }
});

/** POST /sessions/:sessionId/prepaids — Create a prepaid schedule. */
router.post('/sessions/:sessionId/prepaids', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const { sessionId } = req.params;
    if (!await guardSessionWritable(res, pool, tenantId, sessionId!)) return;

    const body = req.body;
    if (!body.description || !body.prepaidAccount || !body.expenseAccount || !body.totalAmount || !body.startDate || !body.endDate) {
      res.status(400).json({ error: 'description, prepaidAccount, expenseAccount, totalAmount, startDate, endDate are required' });
      return;
    }
    const schedule = await createSchedule(pool, {
      tenantId,
      entityId: body.entityId,
      closeSessionId: sessionId!,
      description: body.description,
      vendor: body.vendor,
      prepaidAccount: body.prepaidAccount,
      expenseAccount: body.expenseAccount,
      totalAmount: Number(body.totalAmount),
      startDate: body.startDate,
      endDate: body.endDate,
    });
    res.status(201).json({ schedule });
  } catch (e) { send500(res, e, 'Create prepaid schedule failed'); }
});

/** GET /sessions/:sessionId/prepaids/:scheduleId/entries — Get amortization entries. */
router.get('/sessions/:sessionId/prepaids/:scheduleId/entries', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const entries = await getEntriesForSchedule(pool, tenantId, req.params.scheduleId!);
    res.json({ entries });
  } catch (e) { send500(res, e, 'List amortization entries failed'); }
});

/** POST /sessions/:sessionId/prepaids/propose — Propose amortization for all active schedules. */
router.post('/sessions/:sessionId/prepaids/propose', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const { sessionId } = req.params;
    if (!await guardSessionWritable(res, pool, tenantId, sessionId!)) return;

    const { periodLabel, createdBy } = req.body;
    if (!periodLabel) { res.status(400).json({ error: 'periodLabel is required' }); return; }
    const entries = await proposeAmortizationEntries(pool, tenantId, sessionId!, periodLabel, createdBy ?? 'system');
    res.json({ entries, count: entries.length });
  } catch (e) { send500(res, e, 'Propose amortization entries failed'); }
});

/** POST /sessions/:sessionId/prepaids/:scheduleId/post-update — Update schedule after JE posting. */
router.post('/sessions/:sessionId/prepaids/:scheduleId/post-update', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const { sessionId, scheduleId } = req.params;
    if (!await guardSessionWritable(res, pool, tenantId, sessionId!)) return;

    const { postedAmount } = req.body;
    if (postedAmount == null) { res.status(400).json({ error: 'postedAmount is required' }); return; }
    const schedule = await updateScheduleAfterPosting(pool, tenantId, scheduleId!, Number(postedAmount));
    res.json({ schedule });
  } catch (e) { send500(res, e, 'Update prepaid schedule after posting failed'); }
});

export default router;
