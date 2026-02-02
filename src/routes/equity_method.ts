/**
 * Equity method investments API.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';
import { createInvestment, getInvestment, listInvestments, updateInvestment, deleteInvestment, listIncome, calculateEquityIncome } from '../services/equity_method_service.js';
import { assessInfluenceAgentic, reconcileBasisDifferenceAgentic, assessImpairmentIndicatorsAgentic } from '../services/agentic_equity_method.js';
import { validateBody, validateParams } from '../middleware/validateRequest.js';
import {
  createInvestmentSchema,
  updateInvestmentSchema,
  recordIncomeSchema,
  assessInfluenceSchema,
  reconcileBasisSchema,
  assessImpairmentIndicatorsSchema,
  investmentIdParamSchema,
} from '../schemas/equityMethodSchemas.js';

const router = Router();

router.post('/', validateBody(createInvestmentSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const body = req.body;
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const inv = await createInvestment(tenantId, pool, body);
    res.status(201).json(inv);
  } catch (e) { res.status(500).json({ error: 'Create failed', message: e instanceof Error ? e.message : String(e) }); }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const investments = await listInvestments(tenantId, pool);
    res.json({ investments });
  } catch (e) { res.status(500).json({ error: 'List failed', message: e instanceof Error ? e.message : String(e) }); }
});

router.get('/:id', validateParams(investmentIdParamSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id;
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const inv = await getInvestment(tenantId, pool, id);
    if (!inv) { res.status(404).json({ error: 'Not found' }); return; }
    const income = await listIncome(tenantId, pool, id);
    res.json({ investment: inv, incomeHistory: income });
  } catch (e) { res.status(500).json({ error: 'Get failed', message: e instanceof Error ? e.message : String(e) }); }
});

router.patch('/:id', validateParams(investmentIdParamSchema), validateBody(updateInvestmentSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id;
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const inv = await updateInvestment(tenantId, pool, id, req.body);
    res.json(inv);
  } catch (e) { res.status(500).json({ error: 'Update failed', message: e instanceof Error ? e.message : String(e) }); }
});

router.delete('/:id', validateParams(investmentIdParamSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id;
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const deleted = await deleteInvestment(tenantId, pool, id);
    res.json({ success: deleted });
  } catch (e) { res.status(500).json({ error: 'Delete failed', message: e instanceof Error ? e.message : String(e) }); }
});

router.post('/:id/income', validateParams(investmentIdParamSchema), validateBody(recordIncomeSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const investmentId = req.params.id;
    const body = req.body;
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const result = await calculateEquityIncome(tenantId, pool, investmentId, body.periodLabel, body.investeeNetIncome, body.dividendsReceived, body.impairmentLoss);
    res.status(201).json(result);
  } catch (e) { res.status(500).json({ error: 'Calculate income failed', message: e instanceof Error ? e.message : String(e) }); }
});

router.post('/assess-influence', validateBody(assessInfluenceSchema), async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const result = await assessInfluenceAgentic(body.ownershipPercent, body.factors ?? {});
    res.json(result);
  } catch (e) { res.status(500).json({ error: 'Assessment failed', message: e instanceof Error ? e.message : String(e) }); }
});

router.post('/reconcile-basis', validateBody(reconcileBasisSchema), async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const result = await reconcileBasisDifferenceAgentic(body.purchasePrice, body.bookValueShare, body.fairValueAdjustments);
    res.json(result);
  } catch (e) { res.status(500).json({ error: 'Reconciliation failed', message: e instanceof Error ? e.message : String(e) }); }
});

router.post('/assess-impairment', validateBody(assessImpairmentIndicatorsSchema), async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const result = await assessImpairmentIndicatorsAgentic(body.investeePerformance);
    res.json(result);
  } catch (e) { res.status(500).json({ error: 'Assessment failed', message: e instanceof Error ? e.message : String(e) }); }
});

export default router;
