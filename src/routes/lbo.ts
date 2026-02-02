/**
 * LBO API — models, sources/uses, projection, agentic (CFA).
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';
import {
  createLboModel,
  getLboModel,
  listLboModels,
  updateLboModel,
  deleteLboModel,
  buildSourcesUses,
  buildDebtSchedule,
  runLboProjection,
} from '../services/lbo_service.js';
import { getPromptsForValuation } from '../services/risk_context_store.js';
import { assertFreshnessForValuation } from '../services/freshness_interlock_service.js';
import {
  suggestExitMultipleAgentic,
  suggestDebtCapacityAgentic,
  generateLboMemoAgentic,
} from '../services/agentic_lbo.js';
import { validateBody, validateParams } from '../middleware/validateRequest.js';
import {
  createLboModelSchema,
  updateLboModelSchema,
  calculateLboSchema,
  suggestExitMultipleSchema,
  suggestDebtCapacitySchema,
  lboIdParamSchema,
} from '../schemas/lboSchemas.js';

const router = Router();

router.post('/', validateBody(createLboModelSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const periodLabel = req.body.periodLabel ?? (req.query.periodLabel as string | undefined);
    if (periodLabel) {
      const freshness = await assertFreshnessForValuation(pool, tenantId, periodLabel);
      if (!freshness.allowed) {
        res.status(freshness.status).json({
          error: freshness.message,
          code: freshness.code,
          message: freshness.message,
        });
        return;
      }
    }
    const model = await createLboModel(tenantId, pool, req.body);
    const valuationPrompts = await getPromptsForValuation(tenantId, req.body.periodLabel ?? (req.query.periodLabel as string | undefined), pool ?? undefined);
    res.status(201).json({ ...model, valuationPrompts });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Create LBO model failed', message });
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const list = await listLboModels(tenantId, pool);
    res.json({ models: list });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'List LBO models failed', message });
  }
});

router.post(
  '/calculate',
  validateBody(calculateLboSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const pool = getTenantPool(req);
      const body = req.body;
      const periodLabel = body.periodLabel ?? (req.query.periodLabel as string | undefined);
      if (tenantId && pool && periodLabel) {
        const freshness = await assertFreshnessForValuation(pool, tenantId, periodLabel);
        if (!freshness.allowed) {
          res.status(freshness.status).json({
            error: freshness.message,
            code: freshness.code,
            message: freshness.message,
          });
          return;
        }
      }
      const acquisitionPrice = body.acquisitionPrice;
      const feesPct = body.feesPct ?? 0.02;
      const existingDebt = body.existingDebt ?? 0;
      const cash = body.cash ?? 0;
      const sourcesUses = buildSourcesUses(acquisitionPrice, feesPct, existingDebt, cash);
      const equityInvested = sourcesUses.sources.equity;
      const initialDebt = sourcesUses.sources.debt;
      const rate = body.rate ?? 0.06;
      const exitYear = body.exitYear;
      const repaymentSchedule = Array(exitYear).fill(initialDebt / exitYear);
      const debtSchedule = buildDebtSchedule(initialDebt, rate, repaymentSchedule);
      const result = runLboProjection(
        body.entryEv ?? acquisitionPrice,
        body.initialEbitda,
        body.fcfMarginPct,
        body.growthRate ?? 0.05,
        exitYear,
        body.exitMultiple,
        equityInvested,
        debtSchedule
      );
      if (body.save && tenantId && pool && body.modelId) {
        await updateLboModel(tenantId, pool, body.modelId, {
          irr: result.irr,
          moic: result.moic,
          assumptions: result as unknown,
        });
      }
      const valuationPrompts = await getPromptsForValuation(tenantId ?? 'default', body.periodLabel ?? (req.query.periodLabel as string | undefined), pool ?? undefined);
      res.json({ sourcesUses, result, valuationPrompts });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: 'Calculate LBO failed', message });
    }
  }
);

router.post(
  '/suggest-exit-multiple',
  validateBody(suggestExitMultipleSchema),
  async (req: Request, res: Response) => {
    try {
      const result = await suggestExitMultipleAgentic(req.body);
      res.json(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: 'Suggest exit multiple failed', message });
    }
  }
);

router.post(
  '/suggest-debt',
  validateBody(suggestDebtCapacitySchema),
  async (req: Request, res: Response) => {
    try {
      const result = await suggestDebtCapacityAgentic(req.body);
      res.json(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: 'Suggest debt failed', message });
    }
  }
);

router.get('/:id', validateParams(lboIdParamSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id as string;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const model = await getLboModel(tenantId, pool, id);
    if (!model) {
      res.status(404).json({ error: 'LBO model not found', id });
      return;
    }
    res.json(model);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Get LBO model failed', message });
  }
});

router.patch(
  '/:id',
  validateParams(lboIdParamSchema),
  validateBody(updateLboModelSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const pool = getTenantPool(req);
      const id = req.params.id as string;
      if (!tenantId || !pool) {
        res.status(400).json({ error: 'Tenant context required' });
        return;
      }
      const updated = await updateLboModel(tenantId, pool, id, req.body);
      if (!updated) {
        res.status(404).json({ error: 'LBO model not found', id });
        return;
      }
      res.json(updated);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: 'Update LBO model failed', message });
    }
  }
);

router.delete('/:id', validateParams(lboIdParamSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id as string;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const deleted = await deleteLboModel(tenantId, pool, id);
    if (!deleted) {
      res.status(404).json({ error: 'LBO model not found', id });
      return;
    }
    res.status(204).send();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Delete LBO model failed', message });
  }
});

router.post(
  '/:id/memo',
  validateParams(lboIdParamSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const pool = getTenantPool(req);
      const id = req.params.id as string;
      if (!tenantId || !pool) {
        res.status(400).json({ error: 'Tenant context required' });
        return;
      }
      const model = await getLboModel(tenantId, pool, id);
      if (!model || model.irr == null || model.moic == null) {
        res.status(404).json({ error: 'LBO model not found or missing IRR/MOIC', id });
        return;
      }
      const result = await generateLboMemoAgentic({
        irr: model.irr,
        moic: model.moic,
        exitYear: model.exitYear ?? 5,
        entryEv: model.entryEv ?? 0,
        equityValueAtExit: (model.equityAmount ?? 0) * (model.moic ?? 0),
      });
      res.json(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: 'Generate memo failed', message });
    }
  }
);

export default router;
