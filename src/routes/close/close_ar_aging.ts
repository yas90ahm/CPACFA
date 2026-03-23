/**
 * AR Aging + CECL routes — aging snapshots, CECL config, allowance computation.
 * Mounted at /api/close via close/index.ts.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { send500 } from '../../lib/errorHandler.js';
import { guardSessionWritable } from '../../lib/session_write_guard.js';
import {
  importAgingFromFile,
  getSnapshots,
  getAgingDetail,
  getCECLConfig,
  updateCECLConfig,
  computeCECLAllowance,
  proposeAllowanceAJE,
} from '../../services/ar_aging_service.js';

const router = Router();

/** GET /sessions/:sessionId/ar-aging — List AR aging snapshots. */
router.get('/sessions/:sessionId/ar-aging', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const snapshots = await getSnapshots(pool, tenantId, req.params.sessionId!);
    res.json({ snapshots });
  } catch (e) { send500(res, e, 'List AR aging snapshots failed'); }
});

/** POST /sessions/:sessionId/ar-aging/import — Import aging data. */
router.post('/sessions/:sessionId/ar-aging/import', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const { sessionId } = req.params;
    if (!await guardSessionWritable(res, pool, tenantId, sessionId!)) return;

    const { snapshotDate, rows, entityId } = req.body;
    if (!snapshotDate || !Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: 'snapshotDate and rows[] are required' }); return;
    }
    const snapshot = await importAgingFromFile(pool, tenantId, sessionId!, snapshotDate, rows, entityId);
    res.status(201).json({ snapshot });
  } catch (e) { send500(res, e, 'Import AR aging failed'); }
});

/** GET /sessions/:sessionId/ar-aging/:snapshotId/detail — Get aging detail. */
router.get('/sessions/:sessionId/ar-aging/:snapshotId/detail', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const detail = await getAgingDetail(pool, tenantId, req.params.snapshotId!);
    res.json({ detail });
  } catch (e) { send500(res, e, 'Get AR aging detail failed'); }
});

/** GET /sessions/:sessionId/cecl-config — Get CECL loss rate config. */
router.get('/sessions/:sessionId/cecl-config', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const config = await getCECLConfig(pool, tenantId, req.query.entityId as string | undefined);
    res.json({ config });
  } catch (e) { send500(res, e, 'Get CECL config failed'); }
});

/** PUT /sessions/:sessionId/cecl-config — Update CECL loss rates. */
router.put('/sessions/:sessionId/cecl-config', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const config = await updateCECLConfig(pool, tenantId, req.body);
    res.json({ config });
  } catch (e) { send500(res, e, 'Update CECL config failed'); }
});

/** POST /sessions/:sessionId/ar-aging/:snapshotId/cecl-compute — Compute CECL allowance. */
router.post('/sessions/:sessionId/ar-aging/:snapshotId/cecl-compute', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const { sessionId, snapshotId } = req.params;
    if (!await guardSessionWritable(res, pool, tenantId, sessionId!)) return;

    const { currentAllowanceBalance } = req.body;
    const computation = await computeCECLAllowance(pool, tenantId, snapshotId!, sessionId!, Number(currentAllowanceBalance ?? 0));
    res.json({ computation });
  } catch (e) { send500(res, e, 'Compute CECL allowance failed'); }
});

/** POST /sessions/:sessionId/cecl/:computationId/propose — Propose CECL AJE. */
router.post('/sessions/:sessionId/cecl/:computationId/propose', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const { sessionId, computationId } = req.params;
    if (!await guardSessionWritable(res, pool, tenantId, sessionId!)) return;

    const { createdBy } = req.body;
    const result = await proposeAllowanceAJE(pool, tenantId, computationId!, createdBy ?? 'system');
    res.json(result);
  } catch (e) { send500(res, e, 'Propose CECL AJE failed'); }
});

export default router;
