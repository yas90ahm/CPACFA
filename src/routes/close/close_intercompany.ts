/**
 * Intercompany reconciliation routes.
 * Mounted at /api/close via close/index.ts.
 *
 * Endpoints:
 *   GET  /sessions/:sessionId/intercompany/pairs       — List intercompany pairs
 *   POST /sessions/:sessionId/intercompany/pairs       — Create intercompany pair
 *   POST /sessions/:sessionId/intercompany/compute     — Compute intercompany reconciliation
 *   GET  /sessions/:sessionId/intercompany/results     — List reconciliation results
 *   GET  /sessions/:sessionId/intercompany/results/:id — Get single reconciliation result
 *   PATCH /sessions/:sessionId/intercompany/results/:id — Update resolution
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { send500 } from '../../lib/errorHandler.js';
import { guardSessionWritable } from '../../lib/session_write_guard.js';
import { getCloseSessionById } from '../../db/repositories/close_session_repository.js';
import {
  listPairs,
  createPair,
  runAndPersistReconciliation,
  listReconciliations,
  getReconciliation,
  updateReconciliationResolution,
} from '../../services/intercompany_reconciliation_service.js';

const router = Router();

/** GET /sessions/:sessionId/intercompany/pairs — List intercompany pairs for tenant. */
router.get('/sessions/:sessionId/intercompany/pairs', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const pairs = await listPairs(pool, tenantId);
    res.json({ pairs });
  } catch (e) {
    send500(res, e, 'List intercompany pairs failed');
  }
});

/** POST /sessions/:sessionId/intercompany/pairs — Create an intercompany pair. */
router.post('/sessions/:sessionId/intercompany/pairs', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const { sessionId } = req.params;
    if (!await guardSessionWritable(res, pool, tenantId, sessionId!)) return;

    const body = req.body as {
      entityAId?: string;
      entityBId?: string;
      accountNameA?: string;
      accountNameB?: string;
      name?: string;
    };
    if (!body.entityAId || !body.entityBId || !body.accountNameA || !body.accountNameB) {
      res.status(400).json({ error: 'entityAId, entityBId, accountNameA, and accountNameB are required' });
      return;
    }
    const pair = await createPair(pool, tenantId, {
      entityAId: body.entityAId,
      entityBId: body.entityBId,
      accountNameA: body.accountNameA,
      accountNameB: body.accountNameB,
      name: body.name,
    });
    res.status(201).json({ pair });
  } catch (e) {
    send500(res, e, 'Create intercompany pair failed');
  }
});

/** POST /sessions/:sessionId/intercompany/compute — Compute intercompany reconciliation. */
router.post('/sessions/:sessionId/intercompany/compute', async (req: Request, res: Response) => {
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

    const body = req.body as {
      pairId?: string;
      entityALines?: { accountName: string; amount: number; side: 'debit' | 'credit' }[];
      entityBLines?: { accountName: string; amount: number; side: 'debit' | 'credit' }[];
    };
    if (!body.pairId || !Array.isArray(body.entityALines) || !Array.isArray(body.entityBLines)) {
      res.status(400).json({ error: 'pairId, entityALines[], and entityBLines[] are required' });
      return;
    }

    const periodLabel = `${session.periodStart}..${session.periodEnd}`;
    const result = await runAndPersistReconciliation(pool, tenantId, {
      pairId: body.pairId,
      periodLabel,
      entityALines: body.entityALines,
      entityBLines: body.entityBLines,
    });
    res.status(201).json({ result });
  } catch (e) {
    if (e instanceof Error && e.message === 'Intercompany pair not found') {
      res.status(404).json({ error: e.message });
      return;
    }
    send500(res, e, 'Compute intercompany reconciliation failed');
  }
});

/** GET /sessions/:sessionId/intercompany/results — List reconciliation results. */
router.get('/sessions/:sessionId/intercompany/results', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const pairId = req.query.pairId as string | undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const results = await listReconciliations(pool, tenantId, { pairId, limit });
    res.json({ results });
  } catch (e) {
    send500(res, e, 'List intercompany reconciliations failed');
  }
});

/** GET /sessions/:sessionId/intercompany/results/:id — Get single reconciliation result. */
router.get('/sessions/:sessionId/intercompany/results/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const result = await getReconciliation(pool, req.params.id!, tenantId);
    if (!result) {
      res.status(404).json({ error: 'Reconciliation result not found' });
      return;
    }
    res.json({ result });
  } catch (e) {
    send500(res, e, 'Get intercompany reconciliation failed');
  }
});

/** PATCH /sessions/:sessionId/intercompany/results/:id — Update resolution. */
router.patch('/sessions/:sessionId/intercompany/results/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const { sessionId, id } = req.params;
    if (!await guardSessionWritable(res, pool, tenantId, sessionId!)) return;

    const body = req.body as { resolution?: string; resolvedBy?: string };
    const result = await updateReconciliationResolution(pool, id!, tenantId, body);
    if (!result) {
      res.status(404).json({ error: 'Reconciliation result not found' });
      return;
    }
    res.json({ result });
  } catch (e) {
    send500(res, e, 'Update intercompany resolution failed');
  }
});

export default router;
