/**
 * Payroll accrual routes.
 * Mounted at /api/close via close/index.ts.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { send500 } from '../../lib/errorHandler.js';
import { guardSessionWritable } from '../../lib/session_write_guard.js';
import { getCloseSessionById } from '../../db/repositories/close_session_repository.js';
import {
  getPayrollConfig,
  updatePayrollConfig,
  getPayrollAccrualEntries,
  proposePayrollAccrualAJE,
  importFromPayrollRegister,
} from '../../services/payroll_accrual_service.js';

const router = Router();

/** GET /sessions/:sessionId/payroll-accrual — List payroll accrual entries for session. */
router.get('/sessions/:sessionId/payroll-accrual', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const entries = await getPayrollAccrualEntries(pool, tenantId, req.params.sessionId!);
    res.json({ entries });
  } catch (e) {
    send500(res, e, 'List payroll accrual failed');
  }
});

/** GET /entities/:entityId/payroll-config — Get payroll configuration. */
router.get('/entities/:entityId/payroll-config', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const config = await getPayrollConfig(pool, tenantId, req.params.entityId!);
    res.json({ config });
  } catch (e) {
    send500(res, e, 'Get payroll config failed');
  }
});

/** PUT /entities/:entityId/payroll-config — Update payroll configuration. */
router.put('/entities/:entityId/payroll-config', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const config = await updatePayrollConfig(pool, tenantId, req.params.entityId!, req.body);
    res.json({ config });
  } catch (e) {
    send500(res, e, 'Update payroll config failed');
  }
});

/** POST /sessions/:sessionId/payroll-accrual/propose — Propose payroll accrual AJE. */
router.post('/sessions/:sessionId/payroll-accrual/propose', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const { sessionId } = req.params;
    if (!await guardSessionWritable(res, pool, tenantId, sessionId!)) return;
    const session = await getCloseSessionById(pool, tenantId, sessionId!);
    if (!session) { res.status(404).json({ error: 'Close session not found' }); return; }
    const entry = await proposePayrollAccrualAJE(pool, tenantId, String(session.entityId), sessionId!, String(session.periodEnd));
    res.status(201).json({ entry });
  } catch (e) {
    send500(res, e, 'Propose payroll accrual failed');
  }
});

/** POST /sessions/:sessionId/payroll-accrual/import-register — Import payroll register CSV. */
router.post('/sessions/:sessionId/payroll-accrual/import-register', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const { sessionId } = req.params;
    if (!await guardSessionWritable(res, pool, tenantId, sessionId!)) return;
    const session = await getCloseSessionById(pool, tenantId, sessionId!);
    if (!session) { res.status(404).json({ error: 'Close session not found' }); return; }
    const csvData = req.body?.csv;
    if (!csvData) { res.status(400).json({ error: 'csv field required in body' }); return; }
    const entry = await importFromPayrollRegister(pool, tenantId, String(session.entityId), sessionId!, Buffer.from(csvData, 'utf-8'));
    res.status(201).json({ entry });
  } catch (e) {
    send500(res, e, 'Import payroll register failed');
  }
});

export default router;
