/**
 * Segment reporting routes — operating segments, financials, reconciliation, reportability.
 * Mounted at /api/close via close/index.ts.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { send500 } from '../../lib/errorHandler.js';
import { guardSessionWritable } from '../../lib/session_write_guard.js';
import { getCloseSessionById } from '../../db/repositories/close_session_repository.js';
import {
  listSegments,
  createSegment,
  updateSegment,
  deleteSegment,
  createSegmentFinancials,
  listSegmentFinancials,
  createReconciliation,
  listReconciliations,
  checkReportabilityThresholds,
} from '../../services/segment_service.js';

const router = Router();

/** GET /sessions/:sessionId/segments — List operating segments. */
router.get('/sessions/:sessionId/segments', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const segments = await listSegments(pool, tenantId);
    res.json({ segments });
  } catch (e) {
    send500(res, e, 'List segments failed');
  }
});

/** POST /sessions/:sessionId/segments — Create a segment. */
router.post('/sessions/:sessionId/segments', async (req: Request, res: Response) => {
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
    if (!body.segmentName) {
      res.status(400).json({ error: 'segmentName is required' });
      return;
    }
    const segment = await createSegment(pool, tenantId, body);
    res.status(201).json({ segment });
  } catch (e) {
    send500(res, e, 'Create segment failed');
  }
});

/** PUT /sessions/:sessionId/segments/:id — Update a segment. */
router.put('/sessions/:sessionId/segments/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const { sessionId, id } = req.params;
    if (!await guardSessionWritable(res, pool, tenantId, sessionId!)) return;

    const segment = await updateSegment(pool, tenantId, id!, req.body);
    if (!segment) {
      res.status(404).json({ error: 'Segment not found' });
      return;
    }
    res.json({ segment });
  } catch (e) {
    send500(res, e, 'Update segment failed');
  }
});

/** DELETE /sessions/:sessionId/segments/:id — Delete a segment. */
router.delete('/sessions/:sessionId/segments/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const { sessionId, id } = req.params;
    if (!await guardSessionWritable(res, pool, tenantId, sessionId!)) return;

    const deleted = await deleteSegment(pool, tenantId, id!);
    if (!deleted) {
      res.status(404).json({ error: 'Segment not found' });
      return;
    }
    res.json({ success: true });
  } catch (e) {
    send500(res, e, 'Delete segment failed');
  }
});

/** POST /sessions/:sessionId/segments/financials — Create segment financials. */
router.post('/sessions/:sessionId/segments/financials', async (req: Request, res: Response) => {
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

    const body = req.body;
    if (!body.segmentId) {
      res.status(400).json({ error: 'segmentId is required' });
      return;
    }
    const periodLabel = body.periodLabel ?? `${session.periodStart}..${session.periodEnd}`;
    const financials = await createSegmentFinancials(pool, tenantId, { ...body, periodLabel });
    res.status(201).json({ financials });
  } catch (e) {
    send500(res, e, 'Create segment financials failed');
  }
});

/** GET /sessions/:sessionId/segments/financials — List segment financials. */
router.get('/sessions/:sessionId/segments/financials', async (req: Request, res: Response) => {
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
    const segmentId = req.query.segmentId as string | undefined;
    const financials = await listSegmentFinancials(pool, tenantId, periodLabel, segmentId);
    res.json({ financials });
  } catch (e) {
    send500(res, e, 'List segment financials failed');
  }
});

/** POST /sessions/:sessionId/segments/reconciliation — Create segment-to-consolidated reconciliation. */
router.post('/sessions/:sessionId/segments/reconciliation', async (req: Request, res: Response) => {
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

    const body = req.body;
    if (!body.itemType || body.segmentTotal == null || body.consolidatedTotal == null) {
      res.status(400).json({ error: 'itemType, segmentTotal, and consolidatedTotal are required' });
      return;
    }
    const periodLabel = body.periodLabel ?? `${session.periodStart}..${session.periodEnd}`;
    const reconciliation = await createReconciliation(pool, tenantId, { ...body, periodLabel });
    res.status(201).json({ reconciliation });
  } catch (e) {
    send500(res, e, 'Create segment reconciliation failed');
  }
});

/** GET /sessions/:sessionId/segments/reconciliation — List segment reconciliations. */
router.get('/sessions/:sessionId/segments/reconciliation', async (req: Request, res: Response) => {
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
    const reconciliations = await listReconciliations(pool, tenantId, periodLabel);
    res.json({ reconciliations });
  } catch (e) {
    send500(res, e, 'List segment reconciliations failed');
  }
});

/** POST /sessions/:sessionId/segments/reportability-check — Run ASC 280 reportability check. */
router.post('/sessions/:sessionId/segments/reportability-check', async (req: Request, res: Response) => {
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
    const result = await checkReportabilityThresholds(pool, tenantId, periodLabel);
    res.json({ result });
  } catch (e) {
    send500(res, e, 'Reportability check failed');
  }
});

export default router;
