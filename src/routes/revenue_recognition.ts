/**
 * Revenue recognition: contract, POBs, allocation (agentic), schedule (agentic).
 * All handlers pass tenantId and pool for repository-backed persistence.
 */

import { Router, Request, Response } from 'express';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';
import { getRevenueTopicStandard } from '../constants/accounting/topic_standard_map.js';
import {
  createContract,
  getContract,
  listContracts,
  suggestAllocationAgentic,
  setContractAllocation,
  suggestRecognitionScheduleAgentic,
  generateRevenueFootnoteAgentic,
} from '../services/revenue_recognition_service.js';
import { validateBody, validateParams } from '../middleware/validationMiddleware.js';
import {
  createContractBodySchema,
  setAllocationBodySchema,
  revenueFootnoteBodySchema,
  contractIdParamSchema,
  contractIdPobIdParamsSchema,
} from '../schemas/revenueRecognitionSchemas.js';

const router = Router();

router.post('/contracts', validateBody(createContractBodySchema), async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const pool = getTenantPool(req);
  if (!tenantId || !pool) {
    return res.status(400).json({ error: 'Tenant context required' });
  }
  try {
    const body = req.body;
    const contract = await createContract(tenantId, pool, {
      contractNumber: body.contractNumber,
      customerId: body.customerId,
      customerName: body.customerName,
      startDate: body.startDate,
      endDate: body.endDate,
      totalContractValue: body.totalContractValue,
      currency: body.currency,
      performanceObligations: body.performanceObligations.map((p) => ({
        name: p.name,
        description: p.description,
        satisfiedOverTime: p.satisfiedOverTime,
        allocationPercent: p.allocationPercent,
        allocationAmount: p.allocationAmount,
        scheduleType: p.scheduleType ?? 'linear',
        costToCostTotalEstimated: p.costToCostTotalEstimated,
        costToCostCostsToDate: p.costToCostCostsToDate,
        milestoneAmounts: p.milestoneAmounts,
      })),
    });
    res.status(201).json(contract);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Create contract failed', message });
  }
});

router.get('/contracts', async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const pool = getTenantPool(req);
  if (!tenantId || !pool) {
    return res.status(400).json({ error: 'Tenant context required' });
  }
  try {
    const contracts = await listContracts(tenantId, pool);
    res.json(contracts);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'List contracts failed', message });
  }
});

router.get('/contracts/:id', validateParams(contractIdParamSchema), async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const pool = getTenantPool(req);
  if (!tenantId || !pool) {
    return res.status(400).json({ error: 'Tenant context required' });
  }
  const c = await getContract(tenantId, pool, req.params.id);
  if (!c) return res.status(404).json({ error: 'Contract not found' });
  res.json(c);
});

router.post('/contracts/:id/suggest-allocation', validateParams(contractIdParamSchema), async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const pool = getTenantPool(req);
  if (!tenantId || !pool) {
    return res.status(400).json({ error: 'Tenant context required' });
  }
  try {
    const result = await suggestAllocationAgentic(tenantId, pool, req.params.id);
    if (!result) return res.status(404).json({ error: 'Contract not found' });
    const contract = await getContract(tenantId, pool, req.params.id);
    const allocationPending = result.allocationSource === 'fallback';
    res.json({
      allocation: result.allocation,
      allocationSource: result.allocationSource,
      allocationPending,
      message: allocationPending
        ? 'Allocation is tentative (equal-split fallback). Confirm or supply allocation via PUT /contracts/:id/allocation before using for recognition.'
        : undefined,
      contract: contract ?? undefined,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Suggest allocation failed', message });
  }
});

/** PUT /contracts/:id/allocation — Confirm or set allocation (e.g. after user confirms suggested allocation). Required before allocation is used for recognition when allocation was fallback. */
router.put('/contracts/:id/allocation', validateParams(contractIdParamSchema), validateBody(setAllocationBodySchema), async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const pool = getTenantPool(req);
  if (!tenantId || !pool) {
    return res.status(400).json({ error: 'Tenant context required' });
  }
  try {
    const body = req.body;
    const contract = await setContractAllocation(tenantId, pool, req.params.id, body.allocation, {
      ...(body.allocationRationale != null ? { allocationRationale: body.allocationRationale } : {}),
    });
    if (!contract) return res.status(404).json({ error: 'Contract not found' });
    res.json(contract);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Set allocation failed', message });
  }
});

router.post(
  '/contracts/:contractId/pob/:pobId/suggest-schedule',
  validateParams(contractIdPobIdParamsSchema),
  async (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      return res.status(400).json({ error: 'Tenant context required' });
    }
    const { contractId, pobId } = req.params;
    try {
      const schedule = await suggestRecognitionScheduleAgentic(tenantId, pool, contractId, pobId);
      if (!schedule)
        return res
          .status(404)
          .json({
            error: 'Contract/POB not found or POB not satisfied over time',
          });
      const contract = await getContract(tenantId, pool, contractId);
      res.json({ schedule, contract: contract ?? undefined });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: 'Suggest schedule failed', message });
    }
  }
);

/** POST /revenue-recognition/footnote — Agentic: generate revenue footnote */
router.post('/footnote', validateBody(revenueFootnoteBodySchema), async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const topicStandard = body.accountingStandard ? getRevenueTopicStandard(body.accountingStandard) : undefined;
    const result = await generateRevenueFootnoteAgentic({
      contractCount: body.contractCount,
      totalContractValue: body.totalContractValue,
      currency: body.currency,
      periodLabel: body.periodLabel,
      topicStandard,
    });
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Generate footnote failed', message });
  }
});

export default router;
