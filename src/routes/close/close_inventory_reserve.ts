/**
 * Inventory Reserve routes — ASC 330 obsolescence reserve.
 * Mounted at /api/close via close/index.ts.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { send500 } from '../../lib/errorHandler.js';
import { guardSessionWritable } from '../../lib/session_write_guard.js';
import { requireSessionAccountingFramework } from '../../lib/session_framework_guard.js';
import { getCloseSessionById } from '../../db/repositories/close_session_repository.js';
import {
  getInventoryReserve,
  importInventoryAging,
  computeReserve,
  proposeReserveAJE,
  getReserveConfig,
  updateReserveConfig,
} from '../../services/inventory_reserve_service.js';

const router = Router();
const requireUsGaapReserveEngine = requireSessionAccountingFramework(['US_GAAP'], 'Legacy ASC 330 inventory-reserve calculation');
router.use('/sessions/:sessionId/inventory-reserve/compute', requireUsGaapReserveEngine);
router.use('/sessions/:sessionId/inventory-reserve/propose-aje', requireUsGaapReserveEngine);

/** GET /sessions/:sessionId/inventory-reserve — Get reserve summary for session. */
router.get('/sessions/:sessionId/inventory-reserve', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const result = await getInventoryReserve(pool, tenantId, req.params.sessionId!);
    res.json(result);
  } catch (e) {
    send500(res, e, 'Get inventory reserve failed');
  }
});

/** POST /sessions/:sessionId/inventory-reserve/upload — Upload inventory aging CSV. */
router.post('/sessions/:sessionId/inventory-reserve/upload', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const { sessionId } = req.params;
    if (!await guardSessionWritable(res, pool, tenantId, sessionId!)) return;

    const session = await getCloseSessionById(pool, tenantId, sessionId!);
    if (!session) {
      res.status(404).json({ error: 'Close session not found' });
      return;
    }

    const { entityId, csvData } = req.body;
    if (!entityId || !csvData) {
      res.status(400).json({ error: 'entityId and csvData are required' });
      return;
    }

    const csvBuffer = Buffer.from(csvData, 'base64');
    const aging = await importInventoryAging(pool, tenantId, entityId, sessionId!, csvBuffer);
    res.status(201).json({ aging });
  } catch (e) {
    send500(res, e, 'Import inventory aging failed');
  }
});

/** POST /sessions/:sessionId/inventory-reserve/compute — Run reserve computation. */
router.post('/sessions/:sessionId/inventory-reserve/compute', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const { sessionId } = req.params;
    if (!await guardSessionWritable(res, pool, tenantId, sessionId!)) return;

    const { entityId, snapshotId } = req.body;
    if (!entityId || !snapshotId) {
      res.status(400).json({ error: 'entityId and snapshotId are required' });
      return;
    }

    const computation = await computeReserve(pool, tenantId, entityId, sessionId!, snapshotId);
    res.status(201).json({ computation });
  } catch (e) {
    send500(res, e, 'Compute inventory reserve failed');
  }
});

/** POST /sessions/:sessionId/inventory-reserve/propose-aje — Propose reserve adjustment JE. */
router.post('/sessions/:sessionId/inventory-reserve/propose-aje', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const { sessionId } = req.params;
    if (!await guardSessionWritable(res, pool, tenantId, sessionId!)) return;

    const { entityId, computationId } = req.body;
    if (!entityId || !computationId) {
      res.status(400).json({ error: 'entityId and computationId are required' });
      return;
    }

    const result = await proposeReserveAJE(pool, tenantId, entityId, sessionId!, computationId);
    res.json(result);
  } catch (e) {
    send500(res, e, 'Propose inventory reserve AJE failed');
  }
});

/** GET /entities/:entityId/inventory-reserve-config — Get reserve config. */
router.get('/entities/:entityId/inventory-reserve-config', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const config = await getReserveConfig(pool, tenantId, req.params.entityId!);
    res.json({ config });
  } catch (e) {
    send500(res, e, 'Get inventory reserve config failed');
  }
});

/** PUT /entities/:entityId/inventory-reserve-config — Update reserve config. */
router.put('/entities/:entityId/inventory-reserve-config', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const config = await updateReserveConfig(pool, tenantId, req.params.entityId!, req.body);
    res.json({ config });
  } catch (e) {
    send500(res, e, 'Update inventory reserve config failed');
  }
});

export default router;
