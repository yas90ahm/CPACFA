/**
 * Deferred tax API — temporary differences, DTA/DTL, valuation allowance, rate changes (IAS 12 / ASC 740).
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';
import {
  calculateDeferredTax,
  assessValuationAllowance,
  calculateRateChangeImpact,
  createDeferredTaxItem,
  listDeferredTaxItems,
  getDeferredTaxItem,
  updateDeferredTaxItem,
  deleteDeferredTaxItem,
  listValuationAllowances,
  createRateChange,
  listRateChanges,
} from '../services/deferred_tax_service.js';
import {
  scanTemporaryDifferencesAgentic,
  assessValuationAllowanceAgentic,
  analyzeRateChangeAgentic,
  generateTaxFootnoteAgentic,
} from '../services/agentic_deferred_tax.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validateRequest.js';
import {
  calculateDeferredTaxBodySchema,
  listDeferredTaxItemsQuerySchema,
  deferredTaxItemIdParamSchema,
  updateDeferredTaxItemSchema,
  listValuationAllowanceQuerySchema,
} from '../schemas/deferredTaxSchemas.js';

const router = Router();

/** POST /api/deferred-tax/calculate — Calculate deferred tax position */
router.post('/calculate', validateBody(calculateDeferredTaxBodySchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const body = req.body;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const result = await calculateDeferredTax(tenantId, pool, body.periodLabel, body.taxRate);
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Calculate deferred tax failed', message });
  }
});

/** POST /api/deferred-tax/items — Add a temporary difference / NOL / tax credit */
router.post('/items', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const body = req.body;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    if (!body?.periodLabel || !body?.itemType || !body?.description) {
      res.status(400).json({ error: 'Missing required fields: periodLabel, itemType, description' });
      return;
    }
    const item = await createDeferredTaxItem(tenantId, pool, {
      periodLabel: body.periodLabel,
      itemType: body.itemType,
      description: body.description,
      bookBasis: body.bookBasis,
      taxBasis: body.taxBasis,
      temporaryDifference: body.temporaryDifference,
      taxRate: body.taxRate,
      deferredTaxAsset: body.deferredTaxAsset,
      deferredTaxLiability: body.deferredTaxLiability,
      reversalPattern: body.reversalPattern,
      sourceAccount: body.sourceAccount,
      notes: body.notes,
    });
    res.status(201).json(item);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Create item failed', message });
  }
});

/** GET /api/deferred-tax/items — List temporary differences for period */
router.get('/items', validateQuery(listDeferredTaxItemsQuerySchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const periodLabel = req.query.periodLabel as string | undefined;
    const items = await listDeferredTaxItems(tenantId, pool, periodLabel);
    res.json({ items });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'List items failed', message });
  }
});

/** GET /api/deferred-tax/items/:id — Get a specific item */
router.get('/items/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id;
    if (!tenantId || !pool || !id) {
      res.status(400).json({ error: 'Tenant context and ID required' });
      return;
    }
    const item = await getDeferredTaxItem(tenantId, pool, id);
    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }
    res.json(item);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Get item failed', message });
  }
});

/** PATCH /api/deferred-tax/items/:id — Update an item */
router.patch('/items/:id', validateParams(deferredTaxItemIdParamSchema), validateBody(updateDeferredTaxItemSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const item = await updateDeferredTaxItem(tenantId, pool, id, req.body);
    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }
    res.json(item);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Update item failed', message });
  }
});

/** DELETE /api/deferred-tax/items/:id — Delete an item */
router.delete('/items/:id', validateParams(deferredTaxItemIdParamSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id;
    if (!tenantId || !pool || !id) {
      res.status(400).json({ error: 'Tenant context and ID required' });
      return;
    }
    const deleted = await deleteDeferredTaxItem(tenantId, pool, id);
    if (!deleted) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }
    res.json({ success: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Delete item failed', message });
  }
});

/** POST /api/deferred-tax/valuation-allowance — Assess and record valuation allowance */
router.post('/valuation-allowance', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const body = req.body as {
      periodLabel?: string;
      deferredTaxAssetGross?: number;
      projectedTaxableIncome?: number[];
      nolCarryforwardAmount?: number;
      nolExpiry?: string;
      plHistory?: number[];
    };
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    if (!body?.periodLabel || body?.deferredTaxAssetGross == null) {
      res.status(400).json({ error: 'Missing periodLabel or deferredTaxAssetGross' });
      return;
    }
    const evidence = {
      projectedTaxableIncome: body.projectedTaxableIncome ?? [],
      nolCarryforwardAmount: body.nolCarryforwardAmount,
      nolExpiry: body.nolExpiry,
      plHistory: body.plHistory,
    };
    const assessment = await assessValuationAllowance(
      tenantId,
      pool,
      body.periodLabel,
      body.deferredTaxAssetGross,
      evidence
    );
    const allowances = await listValuationAllowances(tenantId, pool, body.periodLabel);
    const allowance = allowances[0] ?? null;
    res.status(201).json({ allowance, assessmentResult: assessment });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes('Insufficient evidence')) {
      res.status(400).json({ error: 'Insufficient evidence', message });
      return;
    }
    res.status(500).json({ error: 'Valuation allowance failed', message });
  }
});

/** GET /api/deferred-tax/valuation-allowance — List valuation allowances */
router.get('/valuation-allowance', validateQuery(listValuationAllowanceQuerySchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const periodLabel = req.query.periodLabel as string | undefined;
    const allowances = await listValuationAllowances(tenantId, pool, periodLabel);
    res.json({ allowances });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'List allowances failed', message });
  }
});

/** POST /api/deferred-tax/rate-change — Record a rate change and calculate impact */
router.post('/rate-change', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const body = req.body;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    if (!body?.periodLabel || body?.oldRate == null || body?.newRate == null) {
      res.status(400).json({ error: 'Missing periodLabel, oldRate, or newRate' });
      return;
    }
    
    // Calculate impact
    const deferredTax = await calculateDeferredTax(tenantId, pool, body.periodLabel, body.oldRate);
    const impact = calculateRateChangeImpact(
      deferredTax.deferredTaxAssetGross,
      deferredTax.deferredTaxLiabilityGross,
      body.oldRate,
      body.newRate
    );
    
    // Record rate change
    const rateChange = await createRateChange(tenantId, pool, {
      periodLabel: body.periodLabel,
      oldRate: body.oldRate,
      newRate: body.newRate,
      enactmentDate: body.enactmentDate,
      impactAmount: impact.impactAmount,
    });
    
    res.status(201).json({ ...rateChange, impact });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Rate change failed', message });
  }
});

/** GET /api/deferred-tax/rate-changes — List rate changes */
router.get('/rate-changes', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const rateChanges = await listRateChanges(tenantId, pool);
    res.json({ rateChanges });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'List rate changes failed', message });
  }
});

/** POST /api/deferred-tax/scan — Agentic scan for temporary differences */
router.post('/scan', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (!body?.trialBalance) {
      res.status(400).json({ error: 'Missing trialBalance' });
      return;
    }
    const result = await scanTemporaryDifferencesAgentic(body.trialBalance, body.taxReturnData);
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Scan failed', message });
  }
});

/** POST /api/deferred-tax/assess-allowance — Agentic valuation allowance assessment */
router.post('/assess-allowance', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (body?.deferredTaxAsset == null) {
      res.status(400).json({ error: 'Missing deferredTaxAsset' });
      return;
    }
    const result = await assessValuationAllowanceAgentic(
      body.deferredTaxAsset,
      body.projections ?? [],
      body.historicalProfitability
    );
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Assess allowance failed', message });
  }
});

/** POST /api/deferred-tax/analyze-rate-change — Agentic rate change analysis */
router.post('/analyze-rate-change', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (body?.currentDTA == null || body?.currentDTL == null || body?.oldRate == null || body?.newRate == null) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }
    const result = await analyzeRateChangeAgentic(body.currentDTA, body.currentDTL, body.oldRate, body.newRate);
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Analyze rate change failed', message });
  }
});

/** POST /api/deferred-tax/footnote — Generate tax footnote */
router.post('/footnote', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const body = req.body;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    if (!body?.periodLabel || body?.taxRate == null) {
      res.status(400).json({ error: 'Missing periodLabel or taxRate' });
      return;
    }
    
    const deferredTaxResult = await calculateDeferredTax(tenantId, pool, body.periodLabel, body.taxRate);
    const footnote = await generateTaxFootnoteAgentic(
      deferredTaxResult,
      body.effectiveTaxRate ?? body.taxRate,
      body.statutoryRate ?? body.taxRate
    );
    res.json({ deferredTaxResult, footnote });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Generate footnote failed', message });
  }
});

export default router;
