/**
 * CFO Dashboard — Scenario analysis (Strategic Sandbox) and saved scenarios (Base, Upside, Downside).
 */

import { Router, type Request, type Response } from 'express';
import { computeCFOKPIs } from '../../services/executive_summarizer.js';
import { saveScenario, listScenarios, getScenario, compareScenarios } from '../../services/saved_scenarios_service.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validationMiddleware.js';
import {
  scenarioBodySchema,
  scenariosBodySchema,
  scenariosQuerySchema,
  scenariosCompareQuerySchema,
  scenarioIdParamSchema,
} from '../../schemas/cfoDashboardSchemas.js';
import type { CFOFinancialSnapshot } from '../../types/cfo-dashboard.js';

const router = Router();
const BACKEND_PYTHON_URL = process.env.BACKEND_PYTHON_URL ?? '';
const PYTHON_BASE = BACKEND_PYTHON_URL.replace(/\/$/, '') || 'http://localhost:5000';

/** Build adjusted snapshot for Strategic Sandbox: revenue change % and new hires (annual salary each). */
function buildScenarioSnapshot(
  snapshot: CFOFinancialSnapshot,
  opts: { revenueChangePercent?: number; newEmployeeCount?: number; newEmployeeSalary?: number }
): CFOFinancialSnapshot {
  const revenueChangePercent = Number(opts.revenueChangePercent) || 0;
  const newEmployeeCount = Math.max(0, Math.floor(Number(opts.newEmployeeCount) || 0));
  const newEmployeeSalary = Math.max(0, Number(opts.newEmployeeSalary) || 0);
  const revenue = (snapshot.revenue ?? 0) * (1 + revenueChangePercent / 100);
  const extraOpEx = newEmployeeCount * newEmployeeSalary;
  const operatingExpenses = (snapshot.operatingExpenses ?? 0) + extraOpEx;
  const costOfGoodsSold = snapshot.costOfGoodsSold ?? 0;
  const operatingIncome = (snapshot.operatingIncome ?? 0) - extraOpEx + (revenue - (snapshot.revenue ?? 0));
  const netIncome = (snapshot.netIncome ?? 0) - extraOpEx + (revenue - (snapshot.revenue ?? 0));
  return {
    ...snapshot,
    revenue,
    costOfGoodsSold,
    operatingExpenses,
    operatingIncome: Number.isFinite(operatingIncome) ? operatingIncome : revenue - costOfGoodsSold - operatingExpenses,
    netIncome: Number.isFinite(netIncome) ? netIncome : revenue - costOfGoodsSold - operatingExpenses,
  };
}

/** POST /api/cfo-dashboard/scenario — Strategic Sandbox: recalc Cash Runway & Break-even via Python sandbox */
router.post('/scenario', validateBody(scenarioBodySchema), async (req: Request, res: Response) => {
  try {
    const { snapshot, revenueChangePercent, newEmployeeCount, newEmployeeSalary } = req.body;
    try {
      const pyResp = await fetch(`${PYTHON_BASE}/api/cfa/scenario-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snapshot,
          revenueChangePercent,
          newEmployeeCount,
          newEmployeeSalary,
        }),
      });
      if (pyResp.ok) {
        const r = (await pyResp.json()) as { burn_rate?: number; runway_months?: number; break_even_revenue?: number };
        if (typeof r.burn_rate === 'number' || typeof r.runway_months === 'number') {
          return res.json({
            kpis: {
              burnRate: Number(r.burn_rate) ?? 0,
              runwayMonths: Number(r.runway_months) ?? 0,
              breakEvenRevenue: Number(r.break_even_revenue) ?? 0,
            },
          });
        }
      }
    } catch {
      /* Python backend unavailable; fall back to Node */
    }
    const adjusted = buildScenarioSnapshot(snapshot, {
      revenueChangePercent,
      newEmployeeCount,
      newEmployeeSalary,
    });
    const kpis = computeCFOKPIs(adjusted);
    res.json({
      kpis: {
        burnRate: kpis.burnRate,
        runwayMonths: kpis.runwayMonths >= 999 ? 999 : kpis.runwayMonths,
        breakEvenRevenue: kpis.breakEvenRevenue ?? 0,
      },
    });
  } catch (e) {
    res.status(500).json({
      error: 'Failed to run scenario analysis',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/cfo-dashboard/scenarios — Save named scenario (Base, Upside, Downside) */
router.post('/scenarios', validateBody(scenariosBodySchema), (req: Request, res: Response) => {
  try {
    const { name, periodLabel, snapshot, kpis, sensitivityResult } = req.body;
    const scenario = saveScenario({
      name,
      periodLabel,
      snapshot,
      kpis,
      sensitivityResult,
    });
    res.status(201).json(scenario);
  } catch (e) {
    res.status(500).json({
      error: 'Save scenario failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET /api/cfo-dashboard/scenarios/compare — Compare scenarios side-by-side (query ids=id1,id2); must be before /scenarios/:id */
router.get('/scenarios/compare', validateQuery(scenariosCompareQuerySchema), (req: Request, res: Response) => {
  try {
    const idsParam = req.query.ids as string;
    const ids = idsParam ? idsParam.split(',').map((s) => s.trim()).filter(Boolean) : [];
    if (ids.length === 0) {
      res.status(400).json({ error: 'Missing query ids (e.g. ids=id1,id2)' });
      return;
    }
    const scenarios = compareScenarios(ids);
    res.json({ scenarios });
  } catch (e) {
    res.status(500).json({
      error: 'Compare scenarios failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET /api/cfo-dashboard/scenarios — List saved scenarios (optional periodLabel) */
router.get('/scenarios', validateQuery(scenariosQuerySchema), (req: Request, res: Response) => {
  try {
    const { periodLabel, limit } = req.query;
    const list = listScenarios({ periodLabel, limit });
    res.json({ scenarios: list });
  } catch (e) {
    res.status(500).json({
      error: 'List scenarios failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET /api/cfo-dashboard/scenarios/:id — Get one saved scenario */
router.get('/scenarios/:id', validateParams(scenarioIdParamSchema), (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const scenario = getScenario(id);
    if (!scenario) {
      res.status(404).json({ error: 'Scenario not found' });
      return;
    }
    res.json(scenario);
  } catch (e) {
    res.status(500).json({
      error: 'Get scenario failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

export default router;
