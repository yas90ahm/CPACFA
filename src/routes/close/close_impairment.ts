/**
 * Impairment testing routes — CGUs, goodwill allocation, impairment tests.
 * Mounted at /api/close via close/index.ts.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { send500 } from '../../lib/errorHandler.js';
import { guardSessionWritable } from '../../lib/session_write_guard.js';
import { requireSessionAccountingFramework } from '../../lib/session_framework_guard.js';
import { getCloseSessionById } from '../../db/repositories/close_session_repository.js';
import {
  listCGUs,
  createCGU,
  deleteCGU,
  createGoodwillAllocation,
  listGoodwillAllocations,
  createImpairmentTest,
  listImpairmentTests,
  getImpairmentTest,
  evaluateImpairment,
  getImpairmentSummary,
} from '../../services/impairment_service.js';

const router = Router();
router.use(
  '/sessions/:sessionId/impairment/evaluate/:testId',
  requireSessionAccountingFramework(['US_GAAP', 'IFRS'], 'Legacy impairment measurement engine')
);

/** GET /sessions/:sessionId/impairment/cgus — List cash generating units. */
router.get('/sessions/:sessionId/impairment/cgus', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const cgus = await listCGUs(pool, tenantId);
    res.json({ cgus });
  } catch (e) {
    send500(res, e, 'List CGUs failed');
  }
});

/** POST /sessions/:sessionId/impairment/cgus — Create a CGU. */
router.post('/sessions/:sessionId/impairment/cgus', async (req: Request, res: Response) => {
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
    if (!body.cguName) {
      res.status(400).json({ error: 'cguName is required' });
      return;
    }
    const cgu = await createCGU(pool, tenantId, body);
    res.status(201).json({ cgu });
  } catch (e) {
    send500(res, e, 'Create CGU failed');
  }
});

/** DELETE /sessions/:sessionId/impairment/cgus/:id — Delete a CGU. */
router.delete('/sessions/:sessionId/impairment/cgus/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const { sessionId, id } = req.params;
    if (!await guardSessionWritable(res, pool, tenantId, sessionId!)) return;

    const deleted = await deleteCGU(pool, tenantId, id!);
    if (!deleted) {
      res.status(404).json({ error: 'CGU not found' });
      return;
    }
    res.json({ success: true });
  } catch (e) {
    send500(res, e, 'Delete CGU failed');
  }
});

/** POST /sessions/:sessionId/impairment/goodwill-allocations — Create a goodwill allocation. */
router.post('/sessions/:sessionId/impairment/goodwill-allocations', async (req: Request, res: Response) => {
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
    if (!body.cguId || body.goodwillAmount == null) {
      res.status(400).json({ error: 'cguId and goodwillAmount are required' });
      return;
    }
    const allocation = await createGoodwillAllocation(pool, tenantId, body);
    res.status(201).json({ allocation });
  } catch (e) {
    send500(res, e, 'Create goodwill allocation failed');
  }
});

/** GET /sessions/:sessionId/impairment/goodwill-allocations — List goodwill allocations. */
router.get('/sessions/:sessionId/impairment/goodwill-allocations', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const cguId = req.query.cguId as string | undefined;
    const allocations = await listGoodwillAllocations(pool, tenantId, cguId);
    res.json({ allocations });
  } catch (e) {
    send500(res, e, 'List goodwill allocations failed');
  }
});

/** POST /sessions/:sessionId/impairment/tests — Create an impairment test. */
router.post('/sessions/:sessionId/impairment/tests', async (req: Request, res: Response) => {
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
    if (!body.testDate || !body.assetType || body.carryingAmount == null || body.recoverableAmount == null || !body.method) {
      res.status(400).json({ error: 'testDate, assetType, carryingAmount, recoverableAmount, and method are required' });
      return;
    }

    const periodLabel = `${session.periodStart}..${session.periodEnd}`;
    const test = await createImpairmentTest(pool, tenantId, { ...body, periodLabel });
    res.status(201).json({ test });
  } catch (e) {
    send500(res, e, 'Create impairment test failed');
  }
});

/** GET /sessions/:sessionId/impairment/tests — List impairment tests. */
router.get('/sessions/:sessionId/impairment/tests', async (req: Request, res: Response) => {
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
    const periodLabel = req.query.periodLabel as string | undefined ?? `${session.periodStart}..${session.periodEnd}`;
    const tests = await listImpairmentTests(pool, tenantId, periodLabel);
    res.json({ tests });
  } catch (e) {
    send500(res, e, 'List impairment tests failed');
  }
});

/** GET /sessions/:sessionId/impairment/tests/:id — Get single impairment test. */
router.get('/sessions/:sessionId/impairment/tests/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const test = await getImpairmentTest(pool, tenantId, req.params.id!);
    if (!test) {
      res.status(404).json({ error: 'Impairment test not found' });
      return;
    }
    res.json({ test });
  } catch (e) {
    send500(res, e, 'Get impairment test failed');
  }
});

/** POST /sessions/:sessionId/impairment/evaluate/:testId — Evaluate an impairment test. */
router.post('/sessions/:sessionId/impairment/evaluate/:testId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const { sessionId, testId } = req.params;
    if (!await guardSessionWritable(res, pool, tenantId, sessionId!)) return;

    const result = await evaluateImpairment(pool, tenantId, testId!);
    res.json({ test: result });
  } catch (e) {
    if (e instanceof Error && e.message === 'Impairment test not found') {
      res.status(404).json({ error: e.message });
      return;
    }
    send500(res, e, 'Evaluate impairment failed');
  }
});

/** GET /sessions/:sessionId/impairment/summary — Get impairment summary. */
router.get('/sessions/:sessionId/impairment/summary', async (req: Request, res: Response) => {
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
    const summary = await getImpairmentSummary(pool, tenantId, periodLabel);
    res.json({ summary });
  } catch (e) {
    send500(res, e, 'Get impairment summary failed');
  }
});

export default router;
