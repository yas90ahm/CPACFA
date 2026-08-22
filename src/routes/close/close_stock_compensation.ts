/**
 * Stock compensation routes — grants, valuations, expense computation, summary.
 * Mounted at /api/close via close/index.ts.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { send500 } from '../../lib/errorHandler.js';
import { guardSessionWritable } from '../../lib/session_write_guard.js';
import { requireSessionAccountingFramework } from '../../lib/session_framework_guard.js';
import { getCloseSessionById } from '../../db/repositories/close_session_repository.js';
import {
  listGrants,
  getGrant,
  createGrant,
  updateGrant,
  recordValuation,
  listValuations,
  listExpenses,
  computeExpenseForPeriod,
  getCompensationSummary,
} from '../../services/stock_compensation_service.js';

const router = Router();
router.use(
  '/sessions/:sessionId/stock-compensation/compute',
  requireSessionAccountingFramework(['US_GAAP'], 'Legacy ASC 718 stock-compensation calculation')
);

/** GET /sessions/:sessionId/stock-compensation/grants — List all grants. */
router.get('/sessions/:sessionId/stock-compensation/grants', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const status = req.query.status as string | undefined;
    const grantType = req.query.grantType as string | undefined;
    const grants = await listGrants(pool, tenantId, { status, grantType });
    res.json({ grants });
  } catch (e) {
    send500(res, e, 'List stock grants failed');
  }
});

/** GET /sessions/:sessionId/stock-compensation/grants/:id — Get single grant. */
router.get('/sessions/:sessionId/stock-compensation/grants/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const grant = await getGrant(pool, tenantId, req.params.id!);
    if (!grant) {
      res.status(404).json({ error: 'Stock grant not found' });
      return;
    }
    res.json({ grant });
  } catch (e) {
    send500(res, e, 'Get stock grant failed');
  }
});

/** POST /sessions/:sessionId/stock-compensation/grants — Create a grant. */
router.post('/sessions/:sessionId/stock-compensation/grants', async (req: Request, res: Response) => {
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
    if (!body.grantDate || !body.grantType || !body.sharesGranted || !body.vestingType) {
      res.status(400).json({ error: 'grantDate, grantType, sharesGranted, and vestingType are required' });
      return;
    }
    const grant = await createGrant(pool, tenantId, body);
    res.status(201).json({ grant });
  } catch (e) {
    send500(res, e, 'Create stock grant failed');
  }
});

/** PUT /sessions/:sessionId/stock-compensation/grants/:id — Update a grant. */
router.put('/sessions/:sessionId/stock-compensation/grants/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const { sessionId, id } = req.params;
    if (!await guardSessionWritable(res, pool, tenantId, sessionId!)) return;

    const grant = await updateGrant(pool, tenantId, id!, req.body);
    if (!grant) {
      res.status(404).json({ error: 'Stock grant not found' });
      return;
    }
    res.json({ grant });
  } catch (e) {
    send500(res, e, 'Update stock grant failed');
  }
});

/** POST /sessions/:sessionId/stock-compensation/grants/:grantId/valuations — Record a valuation. */
router.post('/sessions/:sessionId/stock-compensation/grants/:grantId/valuations', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const { sessionId, grantId } = req.params;
    if (!await guardSessionWritable(res, pool, tenantId, sessionId!)) return;

    const body = req.body;
    if (!body.valuationDate || !body.method || body.fairValuePerShare == null) {
      res.status(400).json({ error: 'valuationDate, method, and fairValuePerShare are required' });
      return;
    }
    const valuation = await recordValuation(pool, tenantId, { grantId: grantId!, ...body });
    res.status(201).json({ valuation });
  } catch (e) {
    send500(res, e, 'Record stock valuation failed');
  }
});

/** GET /sessions/:sessionId/stock-compensation/grants/:grantId/valuations — List valuations for a grant. */
router.get('/sessions/:sessionId/stock-compensation/grants/:grantId/valuations', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const valuations = await listValuations(pool, tenantId, req.params.grantId!);
    res.json({ valuations });
  } catch (e) {
    send500(res, e, 'List stock valuations failed');
  }
});

/** GET /sessions/:sessionId/stock-compensation/expenses — List expenses for the session period. */
router.get('/sessions/:sessionId/stock-compensation/expenses', async (req: Request, res: Response) => {
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
    const expenses = await listExpenses(pool, tenantId, periodLabel);
    res.json({ expenses });
  } catch (e) {
    send500(res, e, 'List stock expenses failed');
  }
});

/** POST /sessions/:sessionId/stock-compensation/compute — Compute expense for the session period. */
router.post('/sessions/:sessionId/stock-compensation/compute', async (req: Request, res: Response) => {
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
    const expenses = await computeExpenseForPeriod(pool, tenantId, periodLabel);
    res.status(201).json({ expenses });
  } catch (e) {
    send500(res, e, 'Compute stock expense failed');
  }
});

/** GET /sessions/:sessionId/stock-compensation/summary — Get compensation summary for the session period. */
router.get('/sessions/:sessionId/stock-compensation/summary', async (req: Request, res: Response) => {
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
    const summary = await getCompensationSummary(pool, tenantId, periodLabel);
    res.json({ summary });
  } catch (e) {
    send500(res, e, 'Get compensation summary failed');
  }
});

export default router;
