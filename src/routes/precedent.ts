/**
 * Precedent transactions API.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';
import { createAnalysis, getAnalysis, listAnalyses, listTransactions, deleteAnalysis, performPrecedentAnalysis } from '../services/precedent_transaction_service.js';
import { suggestTransactionsAgentic, estimateSynergiesAgentic, generatePrecedentMemoAgentic } from '../services/agentic_precedent.js';

const router = Router();

router.post('/precedent', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const body = req.body;
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    if (!body?.targetCompany || !body?.transactions || body?.targetEbitda == null) { res.status(400).json({ error: 'Missing required fields' }); return; }
    const { analysis, result } = await createAnalysis(tenantId, pool, body.targetCompany, body.transactions, body.targetEbitda);
    res.status(201).json({ analysis, result });
  } catch (e) { res.status(500).json({ error: 'Create analysis failed', message: e instanceof Error ? e.message : String(e) }); }
});

router.post('/precedent/calculate', (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (!body?.targetCompany || !body?.transactions || body?.targetEbitda == null) { res.status(400).json({ error: 'Missing required fields' }); return; }
    const result = performPrecedentAnalysis(body.targetCompany, body.transactions, body.targetEbitda);
    res.json(result);
  } catch (e) { res.status(500).json({ error: 'Calculation failed', message: e instanceof Error ? e.message : String(e) }); }
});

router.get('/precedent', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const analyses = await listAnalyses(tenantId, pool);
    res.json({ analyses });
  } catch (e) { res.status(500).json({ error: 'List failed', message: e instanceof Error ? e.message : String(e) }); }
});

router.get('/precedent/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id;
    if (!tenantId || !pool || !id) { res.status(400).json({ error: 'Tenant context and ID required' }); return; }
    const analysis = await getAnalysis(tenantId, pool, id);
    if (!analysis) { res.status(404).json({ error: 'Not found' }); return; }
    const transactions = await listTransactions(tenantId, pool, id);
    res.json({ analysis, transactions });
  } catch (e) { res.status(500).json({ error: 'Get failed', message: e instanceof Error ? e.message : String(e) }); }
});

router.delete('/precedent/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id;
    if (!tenantId || !pool || !id) { res.status(400).json({ error: 'Tenant context and ID required' }); return; }
    const deleted = await deleteAnalysis(tenantId, pool, id);
    res.json({ success: deleted });
  } catch (e) { res.status(500).json({ error: 'Delete failed', message: e instanceof Error ? e.message : String(e) }); }
});

router.post('/precedent/suggest-transactions', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (!body?.targetCompany || !body?.industry) { res.status(400).json({ error: 'Missing required fields' }); return; }
    const result = await suggestTransactionsAgentic(body.targetCompany, body.industry, body.size ?? 100000000);
    res.json(result);
  } catch (e) { res.status(500).json({ error: 'Suggest failed', message: e instanceof Error ? e.message : String(e) }); }
});

router.post('/precedent/estimate-synergies', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (body?.targetRevenue == null || body?.acquirerRevenue == null) { res.status(400).json({ error: 'Missing required fields' }); return; }
    const result = await estimateSynergiesAgentic(body.targetRevenue, body.acquirerRevenue, body.industry ?? 'General');
    res.json(result);
  } catch (e) { res.status(500).json({ error: 'Estimate failed', message: e instanceof Error ? e.message : String(e) }); }
});

router.post('/precedent/memo', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (!body?.analysis) { res.status(400).json({ error: 'Missing analysis' }); return; }
    const result = await generatePrecedentMemoAgentic(body.analysis);
    res.json(result);
  } catch (e) { res.status(500).json({ error: 'Memo failed', message: e instanceof Error ? e.message : String(e) }); }
});

export default router;
