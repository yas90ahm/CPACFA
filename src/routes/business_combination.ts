/**
 * Business combination API.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';
import { createAcquisition, getAcquisition, listAcquisitions, deleteAcquisition, addPPALineItem, listPPALineItems, addContingentConsideration, listContingentConsideration, calculatePPA, calculateContingentConsiderationFairValue } from '../services/business_combination_service.js';
import { identifyIntangiblesAgentic, valueEarnOutAgentic, generatePPAFootnoteAgentic } from '../services/agentic_business_combination.js';
import { validateBody, validateParams } from '../middleware/validateRequest.js';
import {
  createAcquisitionSchema,
  addPPALineItemSchema,
  addContingentConsiderationSchema,
  identifyIntangiblesSchema,
  valueEarnOutSchema,
  acquisitionIdParamSchema,
} from '../schemas/businessCombinationSchemas.js';

const router = Router();

router.post('/', validateBody(createAcquisitionSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const body = req.body;
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const acq = await createAcquisition(tenantId, pool, body);
    res.status(201).json(acq);
  } catch (e) { res.status(500).json({ error: 'Create failed', message: e instanceof Error ? e.message : String(e) }); }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const acquisitions = await listAcquisitions(tenantId, pool);
    res.json({ acquisitions });
  } catch (e) { res.status(500).json({ error: 'List failed', message: e instanceof Error ? e.message : String(e) }); }
});

router.get('/:id', validateParams(acquisitionIdParamSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id;
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const acq = await getAcquisition(tenantId, pool, id);
    if (!acq) { res.status(404).json({ error: 'Not found' }); return; }
    const ppaItems = await listPPALineItems(tenantId, pool, id);
    const contingent = await listContingentConsideration(tenantId, pool, id);
    res.json({ acquisition: acq, ppaItems, contingentConsideration: contingent });
  } catch (e) { res.status(500).json({ error: 'Get failed', message: e instanceof Error ? e.message : String(e) }); }
});

router.delete('/:id', validateParams(acquisitionIdParamSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id;
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const deleted = await deleteAcquisition(tenantId, pool, id);
    res.json({ success: deleted });
  } catch (e) { res.status(500).json({ error: 'Delete failed', message: e instanceof Error ? e.message : String(e) }); }
});

router.post('/:id/ppa-items', validateParams(acquisitionIdParamSchema), validateBody(addPPALineItemSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const acquisitionId = req.params.id;
    const body = req.body;
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const item = await addPPALineItem(tenantId, pool, { acquisitionId, ...body });
    res.status(201).json(item);
  } catch (e) { res.status(500).json({ error: 'Add item failed', message: e instanceof Error ? e.message : String(e) }); }
});

router.get('/:id/ppa', validateParams(acquisitionIdParamSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const acquisitionId = req.params.id;
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const ppa = await calculatePPA(tenantId, pool, acquisitionId);
    res.json(ppa);
  } catch (e) { res.status(500).json({ error: 'Calculate PPA failed', message: e instanceof Error ? e.message : String(e) }); }
});

router.post('/:id/contingent', validateParams(acquisitionIdParamSchema), validateBody(addContingentConsiderationSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const acquisitionId = req.params.id;
    const body = req.body;
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const cc = await addContingentConsideration(tenantId, pool, { acquisitionId, ...body });
    res.status(201).json(cc);
  } catch (e) { res.status(500).json({ error: 'Add contingent failed', message: e instanceof Error ? e.message : String(e) }); }
});

router.post('/calculate-contingent-fv', (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (!body?.scenarios) { res.status(400).json({ error: 'Missing scenarios' }); return; }
    const fairValue = calculateContingentConsiderationFairValue(body.scenarios);
    res.json({ fairValue, scenarios: body.scenarios });
  } catch (e) { res.status(500).json({ error: 'Calculation failed', message: e instanceof Error ? e.message : String(e) }); }
});

router.post('/identify-intangibles', validateBody(identifyIntangiblesSchema), async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const result = await identifyIntangiblesAgentic(body.acquireeBusiness, body.industry);
    res.json(result);
  } catch (e) { res.status(500).json({ error: 'Identify failed', message: e instanceof Error ? e.message : String(e) }); }
});

router.post('/value-earnout', validateBody(valueEarnOutSchema), async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const result = await valueEarnOutAgentic(body.earnOutTerms, body.historicalPerformance ?? 0);
    res.json(result);
  } catch (e) { res.status(500).json({ error: 'Value failed', message: e instanceof Error ? e.message : String(e) }); }
});

router.post('/:id/footnote', validateParams(acquisitionIdParamSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const acquisitionId = req.params.id;
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const ppa = await calculatePPA(tenantId, pool, acquisitionId);
    const footnote = await generatePPAFootnoteAgentic(ppa);
    res.json({ ppa, footnote });
  } catch (e) { res.status(500).json({ error: 'Footnote failed', message: e instanceof Error ? e.message : String(e) }); }
});

export default router;
