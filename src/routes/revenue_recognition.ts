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

const router = Router();

router.post('/contracts', async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const pool = getTenantPool(req);
  if (!tenantId || !pool) {
    return res.status(400).json({ error: 'Tenant context required' });
  }
  const body = req.body ?? {};
  const {
    contractNumber,
    customerId,
    customerName,
    startDate,
    endDate,
    totalContractValue,
    currency,
    performanceObligations,
  } = body;
  if (
    !contractNumber ||
    !startDate ||
    !endDate ||
    totalContractValue == null ||
    !currency ||
    !Array.isArray(performanceObligations)
  ) {
    return res
      .status(400)
      .json({
        error:
          'contractNumber, startDate, endDate, totalContractValue, currency, performanceObligations required',
      });
  }
  try {
    const contract = await createContract(tenantId, pool, {
      contractNumber,
      customerId,
      customerName,
      startDate,
      endDate,
      totalContractValue: Number(totalContractValue),
      currency,
      performanceObligations: performanceObligations.map(
        (p: {
          name: string;
          description?: string;
          satisfiedOverTime: boolean;
          allocationPercent?: number;
          allocationAmount?: number;
          scheduleType?: string;
          costToCostTotalEstimated?: number;
          costToCostCostsToDate?: number;
          milestoneAmounts?: { date: string; amount: number }[];
        }) => ({
          name: p.name,
          description: p.description,
          satisfiedOverTime: Boolean(p.satisfiedOverTime),
          allocationPercent: p.allocationPercent,
          allocationAmount: p.allocationAmount,
          scheduleType: p.scheduleType ?? 'linear',
          costToCostTotalEstimated: p.costToCostTotalEstimated,
          costToCostCostsToDate: p.costToCostCostsToDate,
          milestoneAmounts: p.milestoneAmounts,
        })
      ),
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

router.get('/contracts/:id', async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const pool = getTenantPool(req);
  if (!tenantId || !pool) {
    return res.status(400).json({ error: 'Tenant context required' });
  }
  const c = await getContract(tenantId, pool, req.params.id as string);
  if (!c) return res.status(404).json({ error: 'Contract not found' });
  res.json(c);
});

router.post('/contracts/:id/suggest-allocation', async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const pool = getTenantPool(req);
  if (!tenantId || !pool) {
    return res.status(400).json({ error: 'Tenant context required' });
  }
  try {
    const result = await suggestAllocationAgentic(tenantId, pool, req.params.id as string);
    if (!result) return res.status(404).json({ error: 'Contract not found' });
    const contract = await getContract(tenantId, pool, req.params.id as string);
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
router.put('/contracts/:id/allocation', async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const pool = getTenantPool(req);
  if (!tenantId || !pool) {
    return res.status(400).json({ error: 'Tenant context required' });
  }
  const allocation = req.body?.allocation as Record<string, number> | undefined;
  const allocationRationale = req.body?.allocationRationale as string | undefined;
  if (!allocation || typeof allocation !== 'object') {
    return res.status(400).json({ error: 'Body must include allocation: { "pob-id": amount, ... }' });
  }
  try {
    const contract = await setContractAllocation(tenantId, pool, req.params.id as string, allocation, {
      ...(allocationRationale != null ? { allocationRationale } : {}),
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
  async (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      return res.status(400).json({ error: 'Tenant context required' });
    }
    const { contractId, pobId } = req.params;
    try {
      const schedule = await suggestRecognitionScheduleAgentic(
        tenantId,
        pool,
        contractId as string,
        pobId as string
      );
      if (!schedule)
        return res
          .status(404)
          .json({
            error: 'Contract/POB not found or POB not satisfied over time',
          });
      const contract = await getContract(tenantId, pool, contractId as string);
      res.json({ schedule, contract: contract ?? undefined });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: 'Suggest schedule failed', message });
    }
  }
);

/** POST /revenue-recognition/footnote — Agentic: generate revenue footnote */
router.post('/footnote', async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const { contractCount, totalContractValue, currency, periodLabel, accountingStandard } = body as {
    contractCount?: number;
    totalContractValue?: number;
    currency?: string;
    periodLabel?: string;
    accountingStandard?: 'ASPE' | 'IFRS' | 'FRS102' | 'US_GAAP';
  };
  if (
    typeof contractCount !== 'number' ||
    typeof totalContractValue !== 'number' ||
    typeof currency !== 'string'
  ) {
    return res
      .status(400)
      .json({ error: 'contractCount, totalContractValue, currency required' });
  }
  try {
    const topicStandard = accountingStandard ? getRevenueTopicStandard(accountingStandard) : undefined;
    const result = await generateRevenueFootnoteAgentic({
      contractCount,
      totalContractValue,
      currency,
      periodLabel,
      topicStandard,
    });
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Generate footnote failed', message });
  }
});

export default router;
