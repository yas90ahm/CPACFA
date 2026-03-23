/**
 * AP Aging + Cutoff Analysis routes — aging snapshots, cutoff items, accrual AJEs.
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
  runCutoffAnalysis,
  getCutoffItems,
  updateCutoffDisposition,
  proposeCutoffAJEs,
} from '../../services/ap_aging_service.js';

const router = Router();

/** GET /sessions/:sessionId/ap-aging — List AP aging snapshots. */
router.get('/sessions/:sessionId/ap-aging', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const snapshots = await getSnapshots(pool, tenantId, req.params.sessionId!);
    res.json({ snapshots });
  } catch (e) { send500(res, e, 'List AP aging snapshots failed'); }
});

/** POST /sessions/:sessionId/ap-aging/import — Import AP aging data. */
router.post('/sessions/:sessionId/ap-aging/import', async (req: Request, res: Response) => {
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
  } catch (e) { send500(res, e, 'Import AP aging failed'); }
});

/** GET /sessions/:sessionId/ap-aging/:snapshotId/detail — Get aging detail. */
router.get('/sessions/:sessionId/ap-aging/:snapshotId/detail', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const detail = await getAgingDetail(pool, tenantId, req.params.snapshotId!);
    res.json({ detail });
  } catch (e) { send500(res, e, 'Get AP aging detail failed'); }
});

/** GET /sessions/:sessionId/ap-cutoff — Get cutoff items. */
router.get('/sessions/:sessionId/ap-cutoff', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const items = await getCutoffItems(pool, tenantId, req.params.sessionId!);
    res.json({ items });
  } catch (e) { send500(res, e, 'Get cutoff items failed'); }
});

/** POST /sessions/:sessionId/ap-cutoff/analyze — Run cutoff analysis. */
router.post('/sessions/:sessionId/ap-cutoff/analyze', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const { sessionId } = req.params;
    if (!await guardSessionWritable(res, pool, tenantId, sessionId!)) return;

    const { periodEnd, candidates, snapshotId } = req.body;
    if (!periodEnd || !Array.isArray(candidates)) {
      res.status(400).json({ error: 'periodEnd and candidates[] are required' }); return;
    }
    const items = await runCutoffAnalysis(pool, tenantId, sessionId!, periodEnd, candidates, snapshotId);
    res.json({ items, count: items.length });
  } catch (e) { send500(res, e, 'Run cutoff analysis failed'); }
});

/** PUT /sessions/:sessionId/ap-cutoff/:itemId — Update cutoff item disposition. */
router.put('/sessions/:sessionId/ap-cutoff/:itemId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const { sessionId, itemId } = req.params;
    if (!await guardSessionWritable(res, pool, tenantId, sessionId!)) return;

    const { disposition, reason } = req.body;
    if (!disposition) { res.status(400).json({ error: 'disposition is required' }); return; }
    const item = await updateCutoffDisposition(pool, tenantId, itemId!, disposition, reason);
    res.json({ item });
  } catch (e) { send500(res, e, 'Update cutoff disposition failed'); }
});

/** POST /sessions/:sessionId/ap-cutoff/propose — Propose AJEs for accrual items. */
router.post('/sessions/:sessionId/ap-cutoff/propose', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const { sessionId } = req.params;
    if (!await guardSessionWritable(res, pool, tenantId, sessionId!)) return;

    const { createdBy, apAccrualAccount } = req.body;
    const result = await proposeCutoffAJEs(pool, tenantId, sessionId!, createdBy ?? 'system', apAccrualAccount ?? '2100');
    res.json(result);
  } catch (e) { send500(res, e, 'Propose cutoff AJEs failed'); }
});

export default router;
