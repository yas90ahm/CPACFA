/**
 * Portfolio analytics API.
 * Freshness Interlock: If an endpoint uses tenant TB/FS for the given period,
 * call assertFreshnessForValuation(pool, tenantId, periodLabel) before analytic output.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';
import {
  createPortfolio,
  getPortfolio,
  listPortfolios,
  deletePortfolio,
  addPosition,
  listPositions,
  recordPerformance,
  listPerformance,
  getPerformanceByPeriod,
  finalizePerformance,
  recordPerformanceCorrection,
  analyzeAllocation,
  calculateSharpeRatio,
  calculateSortinoRatio,
  calculateBeta,
  calculateAlpha,
  calculateMaxDrawdown,
  calculateAttribution,
} from '../services/portfolio_analytics_service.js';
import { suggestAllocationAgentic, suggestRebalancingAgentic, generateRiskNarrativeAgentic, generateAttributionNarrativeAgentic } from '../services/agentic_portfolio.js';
import { getPromptsForValuation } from '../services/risk_context_store.js';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const body = req.body;
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    if (!body?.portfolioName) { res.status(400).json({ error: 'Missing portfolioName' }); return; }
    const portfolio = await createPortfolio(tenantId, pool, body);
    res.status(201).json(portfolio);
  } catch (e) { res.status(500).json({ error: 'Create failed', message: e instanceof Error ? e.message : String(e) }); }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const portfolios = await listPortfolios(tenantId, pool);
    res.json({ portfolios });
  } catch (e) { res.status(500).json({ error: 'List failed', message: e instanceof Error ? e.message : String(e) }); }
});

/** GET /api/portfolio/valuation-prompts — Integration: prompts for DCF/LBO (embedded lease, liquidity). Must be before /:id. */
router.get('/valuation-prompts', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const periodLabel = req.query.periodLabel as string | undefined;
    const valuationPrompts = await getPromptsForValuation(tenantId, periodLabel, pool ?? undefined);
    res.json({ valuationPrompts });
  } catch (e) { res.status(500).json({ error: 'Valuation prompts failed', message: e instanceof Error ? e.message : String(e) }); }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id;
    if (!tenantId || !pool || !id) { res.status(400).json({ error: 'Tenant context and ID required' }); return; }
    const portfolio = await getPortfolio(tenantId, pool, id);
    if (!portfolio) { res.status(404).json({ error: 'Not found' }); return; }
    const positions = await listPositions(tenantId, pool, id);
    const performance = await listPerformance(tenantId, pool, id);
    res.json({ portfolio, positions, performance });
  } catch (e) { res.status(500).json({ error: 'Get failed', message: e instanceof Error ? e.message : String(e) }); }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id;
    if (!tenantId || !pool || !id) { res.status(400).json({ error: 'Tenant context and ID required' }); return; }
    const deleted = await deletePortfolio(tenantId, pool, id);
    res.json({ success: deleted });
  } catch (e) { res.status(500).json({ error: 'Delete failed', message: e instanceof Error ? e.message : String(e) }); }
});

router.post('/:id/positions', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const portfolioId = req.params.id;
    const body = req.body;
    if (!tenantId || !pool || !portfolioId) { res.status(400).json({ error: 'Tenant context and ID required' }); return; }
    if (!body?.assetName || !body?.assetClass) { res.status(400).json({ error: 'Missing required fields' }); return; }
    const pos = await addPosition(tenantId, pool, { portfolioId, ...body });
    res.status(201).json(pos);
  } catch (e) { res.status(500).json({ error: 'Add position failed', message: e instanceof Error ? e.message : String(e) }); }
});

router.post('/:id/performance', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const portfolioId = req.params.id;
    const body = req.body as { periodLabel: string; totalReturn?: number; benchmarkReturn?: number; excessReturn?: number; sharpeRatio?: number; sortinoRatio?: number; beta?: number; alpha?: number; volatility?: number; maxDrawdown?: number };
    if (!tenantId || !pool || !portfolioId) { res.status(400).json({ error: 'Tenant context and ID required' }); return; }
    if (!body?.periodLabel) { res.status(400).json({ error: 'Missing periodLabel' }); return; }
    const existing = await getPerformanceByPeriod(tenantId, pool, portfolioId, body.periodLabel);
    if (existing && existing.status === 'finalized') {
      res.status(403).json({
        error: 'Period is finalized',
        message: 'Use POST /api/portfolios/:id/performance/correction to record a restatement.',
        code: 'PERIOD_FINALIZED',
      });
      return;
    }
    const perf = await recordPerformance(tenantId, pool, { portfolioId, ...body });
    res.status(201).json(perf);
  } catch (e) { res.status(500).json({ error: 'Record performance failed', message: e instanceof Error ? e.message : String(e) }); }
});

/** POST /api/portfolios/:id/performance/finalize — Set period status to finalized (GIPS: immutable thereafter). */
router.post('/:id/performance/finalize', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const portfolioId = req.params.id;
    const body = req.body as { periodLabel: string; finalizedBy?: string };
    if (!tenantId || !pool || !portfolioId) { res.status(400).json({ error: 'Tenant context and ID required' }); return; }
    if (!body?.periodLabel) { res.status(400).json({ error: 'Missing periodLabel' }); return; }
    const updated = await finalizePerformance(tenantId, pool, portfolioId, body.periodLabel, body.finalizedBy);
    if (!updated) {
      res.status(404).json({ error: 'Performance record not found for this period' });
      return;
    }
    res.json(updated);
  } catch (e) { res.status(500).json({ error: 'Finalize failed', message: e instanceof Error ? e.message : String(e) }); }
});

/** POST /api/portfolios/:id/performance/correction — Append correction (restatement) for a finalized period; hash-chained. */
router.post('/:id/performance/correction', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const portfolioId = req.params.id;
    const body = req.body as {
      periodLabel: string;
      reason: string;
      totalReturn?: number;
      benchmarkReturn?: number;
      excessReturn?: number;
      sharpeRatio?: number;
      sortinoRatio?: number;
      beta?: number;
      alpha?: number;
      volatility?: number;
      maxDrawdown?: number;
      createdBy?: string;
    };
    if (!tenantId || !pool || !portfolioId) { res.status(400).json({ error: 'Tenant context and ID required' }); return; }
    if (!body?.periodLabel || !body?.reason?.trim()) { res.status(400).json({ error: 'Missing periodLabel or reason' }); return; }
    const existing = await getPerformanceByPeriod(tenantId, pool, portfolioId, body.periodLabel);
    if (!existing) {
      res.status(404).json({ error: 'Performance record not found for this period' });
      return;
    }
    if (existing.status !== 'finalized') {
      res.status(400).json({ error: 'Period must be finalized before recording a correction', code: 'NOT_FINALIZED' });
      return;
    }
    const correction = await recordPerformanceCorrection(tenantId, pool, {
      portfolioId,
      periodLabel: body.periodLabel,
      originalPerformanceId: existing.id,
      correctionSnapshot: {
        totalReturn: body.totalReturn,
        benchmarkReturn: body.benchmarkReturn,
        excessReturn: body.excessReturn,
        sharpeRatio: body.sharpeRatio,
        sortinoRatio: body.sortinoRatio,
        beta: body.beta,
        alpha: body.alpha,
        volatility: body.volatility,
        maxDrawdown: body.maxDrawdown,
      },
      reason: body.reason.trim(),
      createdBy: body.createdBy,
    });
    res.status(201).json(correction);
  } catch (e) { res.status(500).json({ error: 'Correction failed', message: e instanceof Error ? e.message : String(e) }); }
});

router.get('/:id/allocation', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const portfolioId = req.params.id;
    if (!tenantId || !pool || !portfolioId) { res.status(400).json({ error: 'Tenant context and ID required' }); return; }
    const analysis = await analyzeAllocation(tenantId, pool, portfolioId);
    res.json(analysis);
  } catch (e) { res.status(500).json({ error: 'Analyze allocation failed', message: e instanceof Error ? e.message : String(e) }); }
});

router.post('/calculate-risk-metrics', (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (!body?.returns) { res.status(400).json({ error: 'Missing returns' }); return; }
    const riskFreeRate = body.riskFreeRate ?? 0.02;
    const sharpeRatio = calculateSharpeRatio(body.returns, riskFreeRate);
    const sortinoRatio = calculateSortinoRatio(body.returns, riskFreeRate);
    const maxDrawdown = body.portfolioValues ? calculateMaxDrawdown(body.portfolioValues) : 0;
    const beta = body.benchmarkReturns ? calculateBeta(body.returns, body.benchmarkReturns) : 1;
    const avgReturn = body.returns.reduce((a: number, b: number) => a + b, 0) / body.returns.length;
    const avgBenchmark = body.benchmarkReturns ? body.benchmarkReturns.reduce((a: number, b: number) => a + b, 0) / body.benchmarkReturns.length : 0;
    const alpha = calculateAlpha(avgReturn, avgBenchmark, beta, riskFreeRate);
    res.json({ sharpeRatio: Math.round(sharpeRatio * 100) / 100, sortinoRatio: Math.round(sortinoRatio * 100) / 100, maxDrawdown: Math.round(maxDrawdown * 10000) / 10000, beta: Math.round(beta * 100) / 100, alpha: Math.round(alpha * 10000) / 10000 });
  } catch (e) { res.status(500).json({ error: 'Calculation failed', message: e instanceof Error ? e.message : String(e) }); }
});

router.post('/calculate-attribution', (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (!body?.portfolioWeights || !body?.portfolioReturns || !body?.benchmarkWeights || !body?.benchmarkReturns) { res.status(400).json({ error: 'Missing required fields' }); return; }
    const result = calculateAttribution(body.portfolioWeights, body.portfolioReturns, body.benchmarkWeights, body.benchmarkReturns);
    res.json(result);
  } catch (e) { res.status(500).json({ error: 'Calculation failed', message: e instanceof Error ? e.message : String(e) }); }
});

router.post('/suggest-allocation', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (!body?.investorProfile) { res.status(400).json({ error: 'Missing investorProfile' }); return; }
    const result = await suggestAllocationAgentic(body.investorProfile);
    res.json(result);
  } catch (e) { res.status(500).json({ error: 'Suggestion failed', message: e instanceof Error ? e.message : String(e) }); }
});

router.post('/:id/suggest-rebalancing', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const portfolioId = req.params.id;
    if (!tenantId || !pool || !portfolioId) { res.status(400).json({ error: 'Tenant context and ID required' }); return; }
    const allocationAnalysis = await analyzeAllocation(tenantId, pool, portfolioId);
    const result = await suggestRebalancingAgentic(allocationAnalysis, req.body?.taxLotInfo);
    res.json(result);
  } catch (e) { res.status(500).json({ error: 'Suggestion failed', message: e instanceof Error ? e.message : String(e) }); }
});

router.post('/risk-narrative', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (!body?.performanceData) { res.status(400).json({ error: 'Missing performanceData' }); return; }
    const result = await generateRiskNarrativeAgentic(body.performanceData);
    res.json(result);
  } catch (e) { res.status(500).json({ error: 'Narrative failed', message: e instanceof Error ? e.message : String(e) }); }
});

router.post('/attribution-narrative', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (!body?.attribution) { res.status(400).json({ error: 'Missing attribution' }); return; }
    const result = await generateAttributionNarrativeAgentic(body.attribution);
    res.json(result);
  } catch (e) { res.status(500).json({ error: 'Narrative failed', message: e instanceof Error ? e.message : String(e) }); }
});

export default router;
