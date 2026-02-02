/**
 * Budget versioning, reforecast (agentic), driver-based planning.
 */

import { Router, type Request, type Response } from 'express';
import {
  createBudgetVersion,
  getBudgetVersion,
  listBudgetVersions,
  updateBudgetVersion,
  lockBudgetVersion,
} from '../services/budget_version_service.js';
import { buildDriverBasedPlan } from '../services/driver_based_planning_service.js';
import { runReforecastAgentic } from '../services/agentic_reforecast_service.js';
import type { BudgetVersionLine } from '../types/budget_forecast.js';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';

const router = Router();

/** POST /api/budget/version — Create budget version */
router.post('/version', async (req: Request, res: Response) => {
  try {
    const body = req.body as { name: string; periodLabel: string; lines: BudgetVersionLine[] };
    if (!body?.name || !body?.periodLabel || !Array.isArray(body?.lines)) {
      res.status(400).json({ error: 'Missing name, periodLabel, or lines' });
      return;
    }
    const version = await createBudgetVersion(body, getTenantPool(req), getTenantId(req));
    res.json(version);
  } catch (e) {
    res.status(500).json({
      error: 'Create budget version failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET /api/budget/version/:id — Get budget version */
router.get('/version/:id', async (req: Request, res: Response) => {
  try {
    const version = await getBudgetVersion(req.params.id, getTenantPool(req), getTenantId(req));
    if (!version) {
      res.status(404).json({ error: 'Budget version not found' });
      return;
    }
    res.json(version);
  } catch (e) {
    res.status(500).json({
      error: 'Get budget version failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET /api/budget/version — List budget versions (optional periodLabel) */
router.get('/version', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.query.periodLabel as string | undefined;
    const versions = await listBudgetVersions(periodLabel, getTenantPool(req), getTenantId(req));
    res.json({ versions });
  } catch (e) {
    res.status(500).json({
      error: 'List budget versions failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** PATCH /api/budget/version/:id — Update budget version (draft only) */
router.patch('/version/:id', async (req: Request, res: Response) => {
  try {
    const body = req.body as { name?: string; lines?: BudgetVersionLine[] };
    const updated = await updateBudgetVersion(req.params.id, body, getTenantPool(req), getTenantId(req));
    if (!updated) {
      res.status(400).json({ error: 'Version not found or locked' });
      return;
    }
    res.json(updated);
  } catch (e) {
    res.status(500).json({
      error: 'Update budget version failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/budget/version/:id/lock — Lock budget version */
router.post('/version/:id/lock', async (req: Request, res: Response) => {
  try {
    const body = req.body as { lockedBy: string };
    if (!body?.lockedBy) {
      res.status(400).json({ error: 'Missing lockedBy' });
      return;
    }
    const version = await lockBudgetVersion(req.params.id, body.lockedBy, getTenantPool(req), getTenantId(req));
    if (!version) {
      res.status(400).json({ error: 'Version not found or already locked' });
      return;
    }
    res.json(version);
  } catch (e) {
    res.status(500).json({
      error: 'Lock budget version failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/budget/driver-based — Driver-based plan (formulas + driver values) */
router.post('/driver-based', (req: Request, res: Response) => {
  try {
    const body = req.body as import('../types/budget_forecast.js').DriverBasedPlanInput;
    if (!body?.drivers || !Array.isArray(body.drivers) || !body?.formulas || typeof body.formulas !== 'object') {
      res.status(400).json({ error: 'Missing drivers or formulas' });
      return;
    }
    const result = buildDriverBasedPlan(body);
    res.json(result);
  } catch (e) {
    res.status(500).json({
      error: 'Driver-based plan failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/budget/reforecast — Agentic reforecast from actuals + prior budget */
router.post('/reforecast', async (req: Request, res: Response) => {
  try {
    const body = req.body as import('../types/budget_forecast.js').ReforecastInput;
    if (!body?.actualSnapshot || !body?.periodLabel) {
      res.status(400).json({ error: 'Missing actualSnapshot or periodLabel' });
      return;
    }
    const result = await runReforecastAgentic(body);
    res.json(result);
  } catch (e) {
    res.status(500).json({
      error: 'Reforecast failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

export default router;
