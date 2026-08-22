/**
 * Fixed asset routes — CRUD, depreciation run, summary.
 * Mounted at /api/close via close/index.ts.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { send500 } from '../../lib/errorHandler.js';
import { guardSessionWritable } from '../../lib/session_write_guard.js';
import { requireSessionAccountingFramework } from '../../lib/session_framework_guard.js';
import { getCloseSessionById } from '../../db/repositories/close_session_repository.js';
import {
  listFixedAssets,
  getFixedAsset,
  createFixedAsset,
  updateFixedAsset,
  deleteFixedAsset,
  runDepreciation,
  getDepreciationSummary,
  listDepreciationRuns,
  listDepreciationRunDetails,
} from '../../services/fixed_asset_service.js';

const router = Router();
router.use(
  '/sessions/:sessionId/fixed-assets/depreciation-run',
  requireSessionAccountingFramework(['US_GAAP'], 'Legacy ASC 360 depreciation calculation')
);

/** GET /sessions/:sessionId/fixed-assets — List all fixed assets for tenant. */
router.get('/sessions/:sessionId/fixed-assets', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const assets = await listFixedAssets(tenantId, pool);
    res.json({ assets });
  } catch (e) {
    send500(res, e, 'List fixed assets failed');
  }
});

/** GET /sessions/:sessionId/fixed-assets/:id — Get single fixed asset. */
router.get('/sessions/:sessionId/fixed-assets/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const asset = await getFixedAsset(tenantId, pool, req.params.id!);
    if (!asset) {
      res.status(404).json({ error: 'Fixed asset not found' });
      return;
    }
    res.json({ asset });
  } catch (e) {
    send500(res, e, 'Get fixed asset failed');
  }
});

/** POST /sessions/:sessionId/fixed-assets — Create a fixed asset. */
router.post('/sessions/:sessionId/fixed-assets', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const { sessionId } = req.params;
    if (!await guardSessionWritable(res, pool, tenantId, sessionId!)) return;

    const body = req.body;
    if (!body.assetNumber || !body.description || !body.cost) {
      res.status(400).json({ error: 'assetNumber, description, and cost are required' });
      return;
    }
    const asset = await createFixedAsset(tenantId, pool, body);
    res.status(201).json({ asset });
  } catch (e) {
    send500(res, e, 'Create fixed asset failed');
  }
});

/** PUT /sessions/:sessionId/fixed-assets/:id — Update a fixed asset. */
router.put('/sessions/:sessionId/fixed-assets/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const { sessionId, id } = req.params;
    if (!await guardSessionWritable(res, pool, tenantId, sessionId!)) return;

    const asset = await updateFixedAsset(tenantId, pool, id!, req.body);
    if (!asset) {
      res.status(404).json({ error: 'Fixed asset not found' });
      return;
    }
    res.json({ asset });
  } catch (e) {
    send500(res, e, 'Update fixed asset failed');
  }
});

/** DELETE /sessions/:sessionId/fixed-assets/:id — Delete a fixed asset. */
router.delete('/sessions/:sessionId/fixed-assets/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const { sessionId, id } = req.params;
    if (!await guardSessionWritable(res, pool, tenantId, sessionId!)) return;

    const deleted = await deleteFixedAsset(tenantId, pool, id!);
    if (!deleted) {
      res.status(404).json({ error: 'Fixed asset not found' });
      return;
    }
    res.json({ success: true });
  } catch (e) {
    send500(res, e, 'Delete fixed asset failed');
  }
});

/** POST /sessions/:sessionId/fixed-assets/depreciation-run — Run depreciation for the session period. */
router.post('/sessions/:sessionId/fixed-assets/depreciation-run', async (req: Request, res: Response) => {
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

    const periodLabel = `${session.periodStart}..${session.periodEnd}`;
    const result = await runDepreciation(tenantId, pool, periodLabel, String(session.periodStart), String(session.periodEnd));
    res.status(201).json(result);
  } catch (e) {
    send500(res, e, 'Run depreciation failed');
  }
});

/** GET /sessions/:sessionId/fixed-assets/depreciation-summary — Get depreciation summary for the session period. */
router.get('/sessions/:sessionId/fixed-assets/depreciation-summary', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const session = await getCloseSessionById(pool, tenantId, req.params.sessionId!);
    if (!session) {
      res.status(404).json({ error: 'Close session not found' });
      return;
    }
    const periodLabel = `${session.periodStart}..${session.periodEnd}`;
    const summary = await getDepreciationSummary(tenantId, pool, periodLabel);
    res.json({ summary });
  } catch (e) {
    send500(res, e, 'Get depreciation summary failed');
  }
});

/** GET /sessions/:sessionId/fixed-assets/depreciation-runs — List depreciation runs. */
router.get('/sessions/:sessionId/fixed-assets/depreciation-runs', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const session = await getCloseSessionById(pool, tenantId, req.params.sessionId!);
    if (!session) {
      res.status(404).json({ error: 'Close session not found' });
      return;
    }
    const periodLabel = `${session.periodStart}..${session.periodEnd}`;
    const runs = await listDepreciationRuns(tenantId, pool, periodLabel);
    res.json({ runs });
  } catch (e) {
    send500(res, e, 'List depreciation runs failed');
  }
});

/** GET /sessions/:sessionId/fixed-assets/depreciation-runs/:runId/details — List depreciation run details. */
router.get('/sessions/:sessionId/fixed-assets/depreciation-runs/:runId/details', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const details = await listDepreciationRunDetails(tenantId, pool, req.params.runId!);
    res.json({ details });
  } catch (e) {
    send500(res, e, 'List depreciation run details failed');
  }
});

export default router;
