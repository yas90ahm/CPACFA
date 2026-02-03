/**
 * CFO Dashboard — KPIs: Burn Rate, Runway, Rule of 40, Working Capital; KPI history and targets.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { computeCFOKPIs } from '../../services/executive_summarizer.js';
import { appendKPISnapshot, listKPIHistory } from '../../services/kpi_history_service.js';
import { setKPITarget, listKPITargets, computeVarianceToTarget } from '../../services/kpi_target_service.js';
import { validateBody, validateQuery } from '../../middleware/validationMiddleware.js';
import {
  kpisBodySchema,
  kpiHistoryBodySchema,
  kpiHistoryQuerySchema,
  kpiTargetsBodySchema,
} from '../../schemas/cfoDashboardSchemas.js';

const router = Router();

/** POST /api/cfo-dashboard/kpis — KPIs only: Burn Rate, Runway, Rule of 40, Working Capital; optional varianceToTarget */
router.post('/kpis', validateBody(kpisBodySchema), (req: Request, res: Response) => {
  try {
    const { snapshot } = req.body;
    const kpis = computeCFOKPIs(snapshot);
    const targets = listKPITargets();
    const varianceToTarget = targets.length > 0 ? computeVarianceToTarget(kpis, targets) : undefined;
    res.json({ kpis, ...(varianceToTarget?.length ? { varianceToTarget } : {}) });
  } catch (e) {
    res.status(500).json({
      error: 'Failed to compute KPIs',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/cfo-dashboard/kpi-history — Append KPI snapshot for trend */
router.post('/kpi-history', validateBody(kpiHistoryBodySchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    const { periodLabel, kpis, asAt } = req.body;
    const snap = await appendKPISnapshot({ periodLabel, kpis, asAt }, pool, tenantId);
    res.status(201).json(snap);
  } catch (e) {
    res.status(500).json({
      error: 'Append KPI history failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET /api/cfo-dashboard/kpi-history — List KPI history (optional periodLabel, from, to) */
router.get('/kpi-history', validateQuery(kpiHistoryQuerySchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    const { periodLabel, from, to, limit } = req.query;
    const list = await listKPIHistory({ periodLabel, from, to, limit }, pool, tenantId);
    res.json({ history: list });
  } catch (e) {
    res.status(500).json({
      error: 'List KPI history failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/cfo-dashboard/kpi-targets — Set KPI target (e.g. runway 18 months, DSO 45 days) */
router.post('/kpi-targets', validateBody(kpiTargetsBodySchema), (req: Request, res: Response) => {
  try {
    const body = req.body;
    const target = setKPITarget({
      metric: body.metric,
      targetValue: body.targetValue,
      unit: body.unit,
      label: body.label,
    });
    res.status(201).json(target);
  } catch (e) {
    res.status(500).json({
      error: 'Set KPI target failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET /api/cfo-dashboard/kpi-targets — List KPI targets */
router.get('/kpi-targets', (_req: Request, res: Response) => {
  try {
    const targets = listKPITargets();
    res.json({ targets });
  } catch (e) {
    res.status(500).json({
      error: 'List KPI targets failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

export default router;
