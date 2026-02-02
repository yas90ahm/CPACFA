/**
 * Stock-based compensation API — grants, valuations, expense, dilution (IFRS 2 / ASC 718).
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';
import {
  createGrant,
  getGrant,
  listGrants,
  updateGrant,
  recordValuation,
  calculateExpenseRecognition,
  calculateDilutionImpact,
  calculateBlackScholes,
  generateVestingSchedule,
  getTotalExpenseForPeriod,
} from '../services/stock_compensation_service.js';
import {
  suggestGrantRecognitionAgentic,
  suggestBlackScholesParamsAgentic,
  estimateForfeitureRateAgentic,
  explainDilutionAgentic,
  analyzeModificationAgentic,
} from '../services/agentic_stock_comp.js';
import { validateBody, validateQuery, validateParams } from '../middleware/validateRequest.js';
import {
  createGrantSchema,
  updateGrantSchema,
  listGrantsQuerySchema,
  recordValuationSchema,
  calculateExpenseSchema,
  getExpenseQuerySchema,
  calculateDilutionSchema,
  blackScholesSchema,
  suggestGrantsSchema,
  suggestBlackScholesParamsSchema,
  estimateForfeitureSchema,
  explainDilutionSchema,
  analyzeModificationSchema,
  grantIdParamSchema,
} from '../schemas/stockCompSchemas.js';

const router = Router();

/** POST /api/stock-comp/grants — Create a new stock grant */
router.post('/grants', validateBody(createGrantSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const body = req.body;
    
    // Generate vesting schedule if not provided
    let vestingSchedule = body.vestingSchedule;
    if (!vestingSchedule && body.vestingPeriodMonths) {
      vestingSchedule = generateVestingSchedule(body.grantDate, body.sharesGranted, 'time', {
        vestingPeriodMonths: body.vestingPeriodMonths,
        cliffMonths: body.cliffMonths ?? 0,
        vestingFrequency: body.vestingFrequency ?? 'monthly',
      });
    }
    
    const grant = await createGrant(tenantId, pool, {
      grantDate: body.grantDate,
      grantType: body.grantType,
      recipientId: body.recipientId,
      recipientName: body.recipientName,
      sharesGranted: body.sharesGranted,
      grantPrice: body.grantPrice,
      fairValuePerShare: body.fairValuePerShare,
      vestingType: body.vestingType,
      vestingSchedule: vestingSchedule ?? [],
      expirationDate: body.expirationDate,
      status: body.status ?? 'active',
      forfeitureDate: body.forfeitureDate,
      exerciseDate: body.exerciseDate,
      exercisePrice: body.exercisePrice,
      notes: body.notes,
    });
    res.status(201).json(grant);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Create grant failed', message });
  }
});

/** GET /api/stock-comp/grants — List stock grants */
router.get('/grants', validateQuery(listGrantsQuerySchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const { status, grantType } = req.query;
    const grants = await listGrants(tenantId, pool, { status, grantType });
    res.json({ grants });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'List grants failed', message });
  }
});

/** GET /api/stock-comp/grants/:id — Get a specific grant */
router.get('/grants/:id', validateParams(grantIdParamSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const grant = await getGrant(tenantId, pool, id);
    if (!grant) {
      res.status(404).json({ error: 'Grant not found' });
      return;
    }
    res.json(grant);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Get grant failed', message });
  }
});

/** PATCH /api/stock-comp/grants/:id — Update a grant (forfeit, exercise, modify) */
router.patch('/grants/:id', validateParams(grantIdParamSchema), validateBody(updateGrantSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const grant = await updateGrant(tenantId, pool, id, req.body);
    if (!grant) {
      res.status(404).json({ error: 'Grant not found' });
      return;
    }
    res.json(grant);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Update grant failed', message });
  }
});

/** POST /api/stock-comp/grants/:id/valuation — Record a valuation for a grant */
router.post('/grants/:id/valuation', validateParams(grantIdParamSchema), validateBody(recordValuationSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const grantId = req.params.id;
    const body = req.body;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const valuation = await recordValuation(tenantId, pool, {
      grantId,
      valuationDate: body.valuationDate,
      method: body.method,
      fairValuePerShare: body.fairValuePerShare,
      parameters: body.parameters,
    });
    res.status(201).json(valuation);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Record valuation failed', message });
  }
});

/** GET /api/stock-comp/expense?periodLabel=X — Get total expense for a period */
router.get('/expense', validateQuery(getExpenseQuerySchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const periodLabel = req.query.periodLabel as string;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const totalExpense = await getTotalExpenseForPeriod(tenantId, pool, periodLabel);
    res.json({ periodLabel, totalExpense });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Get expense failed', message });
  }
});

/** POST /api/stock-comp/expense/calculate — Calculate expense recognition for a grant */
router.post('/expense/calculate', validateBody(calculateExpenseSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const body = req.body;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const result = await calculateExpenseRecognition(tenantId, pool, body.grantId, body.periodLabel);
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Calculate expense failed', message });
  }
});

/** POST /api/stock-comp/dilution — Calculate dilution impact */
router.post('/dilution', validateBody(calculateDilutionSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const body = req.body;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const result = await calculateDilutionImpact(tenantId, pool, body.basicShares, body.stockPrice);
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Calculate dilution failed', message });
  }
});

/** POST /api/stock-comp/black-scholes — Calculate Black-Scholes option value */
router.post('/black-scholes', validateBody(blackScholesSchema), (req: Request, res: Response) => {
  try {
    const body = req.body;
    const fairValue = calculateBlackScholes({
      stockPrice: body.stockPrice,
      strikePrice: body.strikePrice,
      riskFreeRate: body.riskFreeRate,
      volatility: body.volatility,
      timeToExpiration: body.timeToExpiration,
      dividendYield: body.dividendYield ?? 0,
    });
    res.json({ fairValue, params: body });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Black-Scholes calculation failed', message });
  }
});

/** POST /api/stock-comp/suggest-grants — Agentic grant recognition from documents */
router.post('/suggest-grants', validateBody(suggestGrantsSchema), async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const result = await suggestGrantRecognitionAgentic(body.documentText);
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Suggest grants failed', message });
  }
});

/** POST /api/stock-comp/suggest-params — Agentic Black-Scholes parameters */
router.post('/suggest-params', validateBody(suggestBlackScholesParamsSchema), async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const result = await suggestBlackScholesParamsAgentic({
      ticker: body.ticker,
      industry: body.industry,
      marketCap: body.marketCap ?? 100000000,
      isPublic: body.isPublic,
    });
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Suggest params failed', message });
  }
});

/** POST /api/stock-comp/estimate-forfeiture — Agentic forfeiture rate estimation */
router.post('/estimate-forfeiture', validateBody(estimateForfeitureSchema), async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const result = await estimateForfeitureRateAgentic({
      totalGrants: body.totalGrants ?? 0,
      forfeitedGrants: body.forfeitedGrants ?? 0,
      avgTenureYears: body.avgTenureYears ?? 3,
      industryTurnoverRate: body.industryTurnoverRate,
    });
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Estimate forfeiture failed', message });
  }
});

/** POST /api/stock-comp/explain-dilution — Agentic dilution explanation */
router.post('/explain-dilution', validateBody(explainDilutionSchema), async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const result = await explainDilutionAgentic(body);
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Explain dilution failed', message });
  }
});

/** POST /api/stock-comp/analyze-modification — Agentic modification analysis */
router.post('/analyze-modification', validateBody(analyzeModificationSchema), async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const result = await analyzeModificationAgentic(body);
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Analyze modification failed', message });
  }
});

export default router;
