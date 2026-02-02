/**
 * Comparable company analysis API.
 * Freshness Interlock: If an endpoint accepts periodLabel and uses tenant period TB/FS
 * for target or comparables, call assertFreshnessForValuation(pool, tenantId, periodLabel).
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';
import {
  createAnalysis,
  getAnalysis,
  listAnalyses,
  deleteAnalysis,
  listComparableCompanies,
  markAsOutlier,
  performComparableAnalysis,
} from '../services/comparable_analysis_service.js';
import {
  suggestComparablesAgentic,
  suggestMultiplesAgentic,
  suggestAdjustmentsAgentic,
  generateCompsMemoAgentic,
  detectOutliersAgentic,
} from '../services/agentic_comps.js';
import { validateBody, validateParams } from '../middleware/validateRequest.js';
import {
  createComparableSetSchema,
  addComparableSchema,
  calculateValuationSchema,
  selectPeersSchema,
  suggestMultiplesSchema,
  suggestAdjustmentsSchema,
  generateMemoSchema,
  detectOutliersSchema,
  comparableSetIdParamSchema,
  comparableCompanyIdParamSchema,
} from '../schemas/compsSchemas.js';

const router = Router();

/** POST /api/valuation/comps — Perform and save comps analysis */
router.post('/comps', validateBody(createComparableSetSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const body = req.body;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    
    const { analysis, result } = await createAnalysis(
      tenantId,
      pool,
      body.targetCompany,
      body.targetMetrics,
      body.comparables,
      body.netDebt
    );
    
    res.status(201).json({ analysis, result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Create analysis failed', message });
  }
});

/** POST /api/valuation/comps/calculate — Perform comps analysis without saving */
router.post('/comps/calculate', validateBody(calculateValuationSchema), (req: Request, res: Response) => {
  try {
    const body = req.body;
    const result = performComparableAnalysis(
      body.targetCompany,
      body.comparables,
      body.targetMetrics,
      body.netDebt
    );
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Comps calculation failed', message });
  }
});

/** GET /api/valuation/comps — List analyses */
router.get('/comps', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const analyses = await listAnalyses(tenantId, pool);
    res.json({ analyses });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'List analyses failed', message });
  }
});

/** GET /api/valuation/comps/:id — Get a specific analysis */
router.get('/comps/:id', validateParams(comparableSetIdParamSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const analysis = await getAnalysis(tenantId, pool, id);
    if (!analysis) {
      res.status(404).json({ error: 'Analysis not found' });
      return;
    }
    const comparables = await listComparableCompanies(tenantId, pool, id);
    res.json({ analysis, comparables });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Get analysis failed', message });
  }
});

/** DELETE /api/valuation/comps/:id — Delete an analysis */
router.delete('/comps/:id', validateParams(comparableSetIdParamSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const deleted = await deleteAnalysis(tenantId, pool, id);
    if (!deleted) {
      res.status(404).json({ error: 'Analysis not found' });
      return;
    }
    res.json({ success: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Delete analysis failed', message });
  }
});

/** PATCH /api/valuation/comps/company/:id/outlier — Mark company as outlier */
router.patch('/comps/company/:id/outlier', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id;
    const body = req.body;
    if (!tenantId || !pool || !id) {
      res.status(400).json({ error: 'Tenant context and ID required' });
      return;
    }
    const success = await markAsOutlier(tenantId, pool, id, body.isOutlier ?? true, body.reason);
    res.json({ success });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Mark outlier failed', message });
  }
});

/** POST /api/valuation/comps/suggest-peers — Agentic peer selection */
router.post('/comps/suggest-peers', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (!body?.targetCompany || !body?.industry) {
      res.status(400).json({ error: 'Missing targetCompany or industry' });
      return;
    }
    const result = await suggestComparablesAgentic(
      body.targetCompany,
      body.industry,
      body.size ?? 100000000,
      body.businessDescription
    );
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Suggest peers failed', message });
  }
});

/** POST /api/valuation/comps/suggest-multiples — Agentic multiple selection */
router.post('/comps/suggest-multiples', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (!body?.industry) {
      res.status(400).json({ error: 'Missing industry' });
      return;
    }
    const result = await suggestMultiplesAgentic(
      body.industry,
      body.growthStage ?? 'mature',
      body.isProfitable ?? true
    );
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Suggest multiples failed', message });
  }
});

/** POST /api/valuation/comps/suggest-adjustments — Agentic adjustment recommendations */
router.post('/comps/suggest-adjustments', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (!body?.targetCharacteristics) {
      res.status(400).json({ error: 'Missing targetCharacteristics' });
      return;
    }
    const result = await suggestAdjustmentsAgentic(
      body.targetCharacteristics,
      body.compMedianGrowth ?? 0.05,
      body.compMedianMargin ?? 0.15
    );
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Suggest adjustments failed', message });
  }
});

/** POST /api/valuation/comps/memo — Generate comps memo */
router.post('/comps/memo', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (!body?.analysis) {
      res.status(400).json({ error: 'Missing analysis' });
      return;
    }
    const result = await generateCompsMemoAgentic(body.analysis);
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Generate memo failed', message });
  }
});

/** POST /api/valuation/comps/detect-outliers — Agentic outlier detection */
router.post('/comps/detect-outliers', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (!body?.comparables) {
      res.status(400).json({ error: 'Missing comparables' });
      return;
    }
    const result = await detectOutliersAgentic(body.comparables);
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Detect outliers failed', message });
  }
});

export default router;
