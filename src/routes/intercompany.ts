/**
 * Intercompany pairs and reconciliation API.
 */

import { Router, type Request, type Response } from 'express';
import { send500 } from '../lib/errorHandler.js';
import {
  listPairs,
  createPair,
  getPair,
  runAndPersistReconciliation,
  getReconciliation,
  listReconciliations,
  updateReconciliationResolution,
  computeIntercompanyReconciliation,
} from '../services/intercompany_reconciliation_service.js';
import { explainIntercompanyVarianceAgentic } from '../services/agentic_intercompany_variance.js';
import type { IntercompanyReconciliationInput } from '../types/intercompany.js';

const getTenantId = (req: Request): string => (req as Request & { tenantId?: string }).tenantId ?? 'default';
const getTenantPool = (req: Request): import('pg').Pool | undefined =>
  (req as Request & { tenantPool?: import('pg').Pool }).tenantPool;

const router = Router();

/** POST /api/intercompany/pairs — Create intercompany pair */
router.post('/pairs', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req) ?? null;
    const body = req.body as {
      entityAId: string;
      entityBId: string;
      accountNameA: string;
      accountNameB: string;
      name?: string;
    };
    if (!body?.entityAId || !body?.entityBId || !body?.accountNameA || !body?.accountNameB) {
      res.status(400).json({ error: 'Missing entityAId, entityBId, accountNameA, or accountNameB' });
      return;
    }
    const pair = await createPair(pool, tenantId, {
      entityAId: body.entityAId,
      entityBId: body.entityBId,
      accountNameA: body.accountNameA,
      accountNameB: body.accountNameB,
      name: body.name,
    });
    res.status(201).json(pair);
  } catch (e) {
    send500(res, e, 'Create intercompany pair failed');
  }
});

/** GET /api/intercompany/pairs — List intercompany pairs */
router.get('/pairs', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req) ?? null;
    const pairs = await listPairs(pool, tenantId);
    res.json({ pairs });
  } catch (e) {
    send500(res, e, 'List intercompany pairs failed');
  }
});

/** POST /api/intercompany/reconciliation — Run IC reconciliation and persist */
router.post('/reconciliation', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req) ?? null;
    const body = req.body as IntercompanyReconciliationInput;
    if (!body?.periodLabel || !body?.pairId || !Array.isArray(body?.entityALines) || !Array.isArray(body?.entityBLines)) {
      res.status(400).json({ error: 'Missing periodLabel, pairId, entityALines, or entityBLines' });
      return;
    }
    if (!pool) {
      const pair = await getPair(null, body.pairId, tenantId);
      if (!pair) {
        res.status(404).json({ error: 'Intercompany pair not found' });
        return;
      }
      const computed = computeIntercompanyReconciliation(pair, body);
      res.json({ result: computed, persisted: false });
      return;
    }
    const result = await runAndPersistReconciliation(pool, tenantId, body);
    res.status(201).json(result);
  } catch (e) {
    send500(res, e, 'Intercompany reconciliation failed');
  }
});

/** GET /api/intercompany/reconciliation — List reconciliations (optional periodLabel, pairId, limit) */
router.get('/reconciliation', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req) ?? null;
    const periodLabel = req.query.periodLabel as string | undefined;
    const pairId = req.query.pairId as string | undefined;
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    const list = await listReconciliations(pool, tenantId, { periodLabel, pairId, limit });
    res.json({ reconciliations: list });
  } catch (e) {
    send500(res, e, 'List intercompany reconciliations failed');
  }
});

/** GET /api/intercompany/reconciliation/:id — Get one reconciliation; ?explain=true for agentic narrative */
router.get('/reconciliation/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req) ?? null;
    const rec = await getReconciliation(pool, req.params.id, tenantId);
    if (!rec) {
      res.status(404).json({ error: 'Reconciliation not found' });
      return;
    }
    const explain = req.query.explain === 'true' || req.query.explain === '1';
    if (explain && rec.status !== 'matched') {
      const narrative = await explainIntercompanyVarianceAgentic(rec);
      res.json({ ...rec, explain: narrative });
      return;
    }
    res.json(rec);
  } catch (e) {
    send500(res, e, 'Get intercompany reconciliation failed');
  }
});

/** POST /api/intercompany/reconciliation/:id/explain — Agentic variance explanation */
router.post('/reconciliation/:id/explain', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req) ?? null;
    const rec = await getReconciliation(pool, req.params.id, tenantId);
    if (!rec) {
      res.status(404).json({ error: 'Reconciliation not found' });
      return;
    }
    const narrative = await explainIntercompanyVarianceAgentic(rec);
    res.json({ explain: narrative });
  } catch (e) {
    send500(res, e, 'Explain intercompany variance failed');
  }
});

/** PATCH /api/intercompany/reconciliation/:id — Update resolution */
router.patch('/reconciliation/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req) ?? null;
    const body = req.body as { resolution?: string; resolvedBy?: string };
    const updated = await updateReconciliationResolution(
      pool,
      req.params.id,
      tenantId,
      { resolution: body?.resolution, resolvedBy: body?.resolvedBy }
    );
    if (!updated) {
      res.status(404).json({ error: 'Reconciliation not found' });
      return;
    }
    res.json(updated);
  } catch (e) {
    send500(res, e, 'Update reconciliation resolution failed');
  }
});

export default router;
