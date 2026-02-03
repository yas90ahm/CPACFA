/**
 * Impairment testing API — CGUs, goodwill, impairment tests (IAS 36 / ASC 350).
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';
import {
  createCGU,
  getCGU,
  listCGUs,
  deleteCGU,
  createGoodwillAllocation,
  listGoodwillAllocations,
  getTotalGoodwillForCGU,
  performImpairmentTest,
  listImpairmentTests,
  getImpairmentTest,
  performSensitivityAnalysis,
  calculateValueInUse,
} from '../services/impairment_testing_service.js';
import {
  suggestCGUsAgentic,
  performQualitativeAssessmentAgentic,
  detectImpairmentTriggersAgentic,
  generateImpairmentFootnoteAgentic,
  suggestDiscountRateAgentic,
} from '../services/agentic_impairment.js';
import { validateBody, validateParams } from '../middleware/validationMiddleware.js';
import {
  createCGUSchema,
  updateCGUSchema,
  allocateGoodwillSchema,
  performImpairmentTestSchema,
  calculateValueInUseSchema,
  impairmentSensitivitySchema,
  suggestCGUsSchema,
  performQualitativeTestSchema,
  detectTriggersSchema,
  generateImpairmentFootnoteSchema,
  suggestDiscountRateSchema,
  cguIdParamSchema,
} from '../schemas/impairmentSchemas.js';

const router = Router();

/** POST /api/impairment/cgus — Create a CGU */
router.post('/cgus', validateBody(createCGUSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const body = req.body;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const cgu = await createCGU(tenantId, pool, body);
    res.status(201).json(cgu);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Create CGU failed', message });
  }
});

/** GET /api/impairment/cgus — List CGUs */
router.get('/cgus', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const cgus = await listCGUs(tenantId, pool);
    res.json({ cgus });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'List CGUs failed', message });
  }
});

/** GET /api/impairment/cgus/:id — Get a specific CGU */
router.get('/cgus/:id', validateParams(cguIdParamSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const cgu = await getCGU(tenantId, pool, id);
    if (!cgu) {
      res.status(404).json({ error: 'CGU not found' });
      return;
    }
    
    // Include goodwill allocation
    const goodwill = await getTotalGoodwillForCGU(tenantId, pool, id);
    res.json({ ...cgu, totalGoodwill: goodwill });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Get CGU failed', message });
  }
});

/** DELETE /api/impairment/cgus/:id — Delete a CGU */
router.delete('/cgus/:id', validateParams(cguIdParamSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const deleted = await deleteCGU(tenantId, pool, id);
    if (!deleted) {
      res.status(404).json({ error: 'CGU not found' });
      return;
    }
    res.json({ success: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Delete CGU failed', message });
  }
});

/** POST /api/impairment/goodwill-allocation — Allocate goodwill to CGU */
router.post('/goodwill-allocation', validateBody(allocateGoodwillSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const body = req.body;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const allocation = await createGoodwillAllocation(tenantId, pool, {
      cguId: body.cguId,
      acquisitionDate: body.acquisitionDate,
      goodwillAmount: body.goodwillAmount,
      allocationRationale: body.allocationRationale,
    });
    res.status(201).json(allocation);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Goodwill allocation failed', message });
  }
});

/** GET /api/impairment/goodwill-allocation — List goodwill allocations */
router.get('/goodwill-allocation', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const cguId = req.query.cguId as string | undefined;
    const allocations = await listGoodwillAllocations(tenantId, pool, cguId);
    res.json({ allocations });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'List allocations failed', message });
  }
});

/** POST /api/impairment/test — Perform impairment test */
router.post('/test', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const body = req.body;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    if (!body?.periodLabel || !body?.assetType || body?.carryingAmount == null || !body?.method) {
      res.status(400).json({ error: 'Missing required fields: periodLabel, assetType, carryingAmount, method' });
      return;
    }
    const result = await performImpairmentTest(tenantId, pool, body);
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Impairment test failed', message });
  }
});

/** GET /api/impairment/tests — List impairment tests */
router.get('/tests', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const periodLabel = req.query.periodLabel as string | undefined;
    const tests = await listImpairmentTests(tenantId, pool, periodLabel);
    res.json({ tests });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'List tests failed', message });
  }
});

/** GET /api/impairment/tests/:id — Get a specific test */
router.get('/tests/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id;
    if (!tenantId || !pool || !id) {
      res.status(400).json({ error: 'Tenant context and ID required' });
      return;
    }
    const test = await getImpairmentTest(tenantId, pool, id);
    if (!test) {
      res.status(404).json({ error: 'Test not found' });
      return;
    }
    res.json(test);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Get test failed', message });
  }
});

/** POST /api/impairment/sensitivity — Perform sensitivity analysis */
router.post('/sensitivity', validateBody(impairmentSensitivitySchema), (req: Request, res: Response) => {
  try {
    const body = req.body;
    const result = performSensitivityAnalysis(
      body.carryingAmount,
      body.cashFlows,
      body.discountRate,
      body.growthRate ?? 0
    );
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Sensitivity analysis failed', message });
  }
});

/** POST /api/impairment/value-in-use — Calculate value in use */
router.post('/value-in-use', validateBody(calculateValueInUseSchema), (req: Request, res: Response) => {
  try {
    const body = req.body;
    const valueInUse = calculateValueInUse(body.cashFlows, body.discountRate, body.growthRate ?? 0);
    res.json({ valueInUse, cashFlows: body.cashFlows, discountRate: body.discountRate, growthRate: body.growthRate ?? 0 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Value in use calculation failed', message });
  }
});

/** POST /api/impairment/suggest-cgus — Agentic CGU identification */
router.post('/suggest-cgus', validateBody(suggestCGUsSchema), async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const result = await suggestCGUsAgentic(body.businessDescription, body.segments);
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Suggest CGUs failed', message });
  }
});

/** POST /api/impairment/qualitative — Agentic qualitative assessment */
router.post('/qualitative', validateBody(performQualitativeTestSchema), async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const result = await performQualitativeAssessmentAgentic(body.cguName, body.marketConditions, body.performance ?? {});
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Qualitative assessment failed', message });
  }
});

/** POST /api/impairment/detect-triggers — Agentic trigger detection */
router.post('/detect-triggers', validateBody(detectTriggersSchema), async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const result = await detectImpairmentTriggersAgentic(body.cguName, body.metrics);
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Trigger detection failed', message });
  }
});

/** POST /api/impairment/footnote — Generate impairment footnote */
router.post('/footnote', validateBody(generateImpairmentFootnoteSchema), async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const result = await generateImpairmentFootnoteAgentic(body.impairmentTest);
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Footnote generation failed', message });
  }
});

/** POST /api/impairment/suggest-discount-rate — Agentic discount rate suggestion */
router.post('/suggest-discount-rate', validateBody(suggestDiscountRateSchema), async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const result = await suggestDiscountRateAgentic({
      name: body.name,
      industry: body.industry,
      size: body.size ?? 'mid',
    });
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Suggest discount rate failed', message });
  }
});

export default router;
