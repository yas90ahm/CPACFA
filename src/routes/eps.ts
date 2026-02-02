/**
 * EPS API — basic/diluted calculation, save, agentic suggestions and footnote (ASC 260).
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';
import {
  calculateDilutedEPS,
  saveEpsCalculation,
  getEpsForPeriod,
  getEpsById,
  listEpsCalculations,
} from '../services/eps_service.js';
import {
  suggestWeightedSharesAgentic,
  generateEpsFootnoteAgentic,
} from '../services/agentic_eps.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validateRequest.js';
import {
  calculateEpsSchema,
  periodQuerySchema,
  suggestWeightedSharesSchema,
  generateEpsFootnoteSchema,
  epsIdParamSchema,
} from '../schemas/epsSchemas.js';

const router = Router();

/** POST /api/eps/calculate — Calculate EPS and optionally save */
router.post(
  '/calculate',
  validateBody(calculateEpsSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const pool = getTenantPool(req);
      const body = req.body;
      if (!tenantId || !pool) {
        res.status(400).json({ error: 'Tenant context required' });
        return;
      }
      const { periodLabel, netIncome, preferredDividends = 0, weightedAvgShares, optionsWarrants = [], convertibles = [] } = body;
      const result = calculateDilutedEPS(
        { netIncome, preferredDividends, weightedAvgShares },
        optionsWarrants,
        convertibles
      );
      const save = body.save === true;
      if (save) {
        const saved = await saveEpsCalculation(tenantId, pool, periodLabel, result);
        res.status(201).json({ result, saved });
        return;
      }
      res.json({ result });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: 'Calculate EPS failed', message });
    }
  }
);

/** GET /api/eps — List or get by period */
router.get('/', validateQuery(periodQuerySchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const periodLabel = req.query.periodLabel as string;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const row = await getEpsForPeriod(tenantId, pool, periodLabel);
    if (!row) {
      res.status(404).json({ error: 'No EPS calculation for period', periodLabel });
      return;
    }
    res.json(row);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Get EPS failed', message });
  }
});

/** GET /api/eps/list — List all EPS calculations for tenant */
router.get('/list', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const list = await listEpsCalculations(tenantId, pool);
    res.json({ calculations: list });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'List EPS failed', message });
  }
});

/** GET /api/eps/:id — Get EPS calculation by id */
router.get('/:id', validateParams(epsIdParamSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id as string;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const row = await getEpsById(tenantId, pool, id);
    if (!row) {
      res.status(404).json({ error: 'EPS calculation not found', id });
      return;
    }
    res.json(row);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Get EPS failed', message });
  }
});

/** POST /api/eps/suggest-weighted-shares — Agentic: suggest weighted average shares */
router.post(
  '/suggest-weighted-shares',
  validateBody(suggestWeightedSharesSchema),
  async (req: Request, res: Response) => {
    try {
      const result = await suggestWeightedSharesAgentic(req.body);
      res.json(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: 'Suggest weighted shares failed', message });
    }
  }
);

/** POST /api/eps/footnote — Agentic: generate EPS footnote. Optional accountingStandard resolves to topic standard (asc260/ias33) for citation. */
router.post(
  '/footnote',
  validateBody(generateEpsFootnoteSchema),
  async (req: Request, res: Response) => {
    try {
      const result = await generateEpsFootnoteAgentic(req.body);
      res.json(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: 'Generate footnote failed', message });
    }
  }
);

export default router;
