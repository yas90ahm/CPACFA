/**
 * Forecasting API — Rolling 13-week cash, quarterly/annual projections.
 */

import { Router, type Request, type Response } from 'express';
import {
  buildRolling13WeekCash,
  buildQuarterlyAnnualProjection,
} from '../services/forecasting_service.js';
import {
  createCashFlowForecast,
  getCashFlowForecast,
  listCashFlowForecasts,
} from '../services/cash_flow_forecast_service.js';
import { generateForecastVsActualNarrativeAgentic } from '../services/agentic_forecasting_capital.js';

const router = Router();

/** POST /api/forecasting/narrative — Agentic forecast vs actual narrative */
router.post('/narrative', async (req: Request, res: Response) => {
  try {
    const body = req.body as { actuals?: object; forecast: object; periodLabel?: string };
    if (body?.forecast == null || typeof body.forecast !== 'object') {
      res.status(400).json({ error: 'Missing or invalid forecast object' });
      return;
    }
    const narrative = await generateForecastVsActualNarrativeAgentic(
      body.actuals ?? {},
      body.forecast,
      body.periodLabel
    );
    res.json({ narrative });
  } catch (e) {
    res.status(500).json({
      error: 'Forecast narrative failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/forecasting/13-week-cash — Rolling 13-week cash forecast */
router.post('/13-week-cash', (req: Request, res: Response) => {
  try {
    const body = req.body as {
      openingCashBalance: number;
      weeklyInflows?: number[];
      weeklyOutflows?: number[];
      startDate?: string;
    };
    if (body?.openingCashBalance == null) {
      res.status(400).json({ error: 'Missing openingCashBalance' });
      return;
    }
    const result = buildRolling13WeekCash({
      openingCashBalance: body.openingCashBalance,
      weeklyInflows: body.weeklyInflows,
      weeklyOutflows: body.weeklyOutflows,
      startDate: body.startDate,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({
      error: '13-week cash forecast failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/forecasting/cash-flow-forecast — First-class cash flow forecast (opening + receipts − disbursements by period) — FW3 */
router.post('/cash-flow-forecast', (req: Request, res: Response) => {
  try {
    const body = req.body as {
      openingBalance: number;
      periods: { periodLabel: string; receipts: number; disbursements: number; receiptSources?: Record<string, number>; disbursementSources?: Record<string, number> }[];
    };
    if (body?.openingBalance == null || !Array.isArray(body?.periods) || body.periods.length === 0) {
      res.status(400).json({ error: 'Missing openingBalance or periods array' });
      return;
    }
    const forecast = createCashFlowForecast(body);
    res.status(201).json(forecast);
  } catch (e) {
    res.status(500).json({
      error: 'Cash flow forecast failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET /api/forecasting/cash-flow-forecast — List cash flow forecasts (optional periodLabel) — FW3 */
router.get('/cash-flow-forecast', (req: Request, res: Response) => {
  try {
    const periodLabel = req.query.periodLabel as string | undefined;
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    const list = listCashFlowForecasts({ periodLabel, limit });
    res.json({ forecasts: list });
  } catch (e) {
    res.status(500).json({
      error: 'List cash flow forecasts failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET /api/forecasting/cash-flow-forecast/:id — Get one cash flow forecast — FW3 */
router.get('/cash-flow-forecast/:id', (req: Request, res: Response) => {
  try {
    const forecast = getCashFlowForecast(req.params.id);
    if (!forecast) {
      res.status(404).json({ error: 'Cash flow forecast not found' });
      return;
    }
    res.json(forecast);
  } catch (e) {
    res.status(500).json({
      error: 'Get cash flow forecast failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/forecasting/quarterly-annual — Quarterly P&L projection */
router.post('/quarterly-annual', (req: Request, res: Response) => {
  try {
    const body = req.body as {
      baseRevenue: number;
      revenueGrowthPercentPerPeriod?: number;
      fixedOpEx: number;
      variableOpExPercentOfRevenue?: number;
      numQuarters?: number;
    };
    if (body?.baseRevenue == null || body?.fixedOpEx == null) {
      res.status(400).json({ error: 'Missing baseRevenue or fixedOpEx' });
      return;
    }
    const result = buildQuarterlyAnnualProjection({
      baseRevenue: body.baseRevenue,
      revenueGrowthPercentPerPeriod: body.revenueGrowthPercentPerPeriod,
      fixedOpEx: body.fixedOpEx,
      variableOpExPercentOfRevenue: body.variableOpExPercentOfRevenue,
      numQuarters: body.numQuarters,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({
      error: 'Quarterly projection failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

export default router;
