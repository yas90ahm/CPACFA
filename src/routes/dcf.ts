/**
 * DCF valuation API — models, WACC, sensitivity analysis.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';
import {
  calculateDCF,
  calculateWACC,
  performSensitivityAnalysis,
  saveDCFModel,
  getDCFModel,
  listDCFModels,
  deleteDCFModel,
  saveWACCCalculation,
  listWACCCalculations,
  saveSensitivityAnalysis,
  getSensitivityAnalysis,
  DCF_GORDON_VALIDATION_ERROR,
} from '../services/dcf_valuation_service.js';
import { getPromptsForValuation, getFlagsForContext } from '../services/risk_context_store.js';
import { getSyntheticNetDebt } from '../services/synthetic_net_debt_service.js';
import { recordObservation } from '../services/audit_ledger_service.js';
import * as lastDcfRepo from '../db/repositories/risk_context_last_dcf_repository.js';
import { assertFreshnessForValuation } from '../services/freshness_interlock_service.js';
import {
  projectRevenueAgentic,
  projectMarginsAgentic,
  calculateWACCAgentic,
  suggestTerminalGrowthAgentic,
  generateValuationSummaryAgentic,
  suggestBetaAgentic,
} from '../services/agentic_dcf.js';
import {
  getHistoricalSnapshotFromCPA,
  formatAccountingContextBlock,
} from '../services/historical_snapshot_service.js';
import { validateBody, validateParams } from '../middleware/validateRequest.js';
import {
  createDCFModelSchema,
  calculateDCFSchema,
  waccInputSchema,
  calculateWACCSchema,
  sensitivityAnalysisSchema,
  projectRevenueSchema,
  projectMarginsSchema,
  suggestWACCSchema,
  suggestGrowthSchema,
  suggestBetaSchema,
  generateValuationSummarySchema,
  dcfModelIdParamSchema,
} from '../schemas/dcfSchemas.js';

const router = Router();

/** POST /api/valuation/dcf — Calculate and save DCF model */
router.post('/dcf', validateBody(createDCFModelSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const body = req.body;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    
    const periodLabel = body.periodLabel ?? (req.query.periodLabel as string | undefined);

    // Freshness Interlock: review must exist and data must not be updated after review
    if (periodLabel) {
      const freshness = await assertFreshnessForValuation(pool, tenantId, periodLabel);
      if (!freshness.allowed) {
        res.status(freshness.status).json({
          error: freshness.message,
          code: freshness.code,
          message: freshness.message,
        });
        return;
      }
    }

    // DCF veto: when going concern is flagged, block positive terminal growth (ASC 205-40 / IAS 1.25)
    const terminalGrowthRate = Number(body.terminalGrowthRate) ?? 0;
    if (terminalGrowthRate > 0 && periodLabel) {
      const professionalFlags = await getFlagsForContext(pool, tenantId, periodLabel);
      const hasGoingConcern = professionalFlags.some((f) => f.category === 'going_concern');
      if (hasGoingConcern) {
        res.status(403).json({
          error: 'DCF blocked when going concern is flagged',
          code: 'GOING_CONCERN_DCF_VETO',
          message:
            'DCF terminal growth must be ≤ 0% when going concern is flagged; resolve or acknowledge going concern before using positive terminal growth.',
        });
        return;
      }
    }

    const synthetic = await getSyntheticNetDebt({
      tenantId,
      pool,
      periodLabel,
      reportedNetDebt: body.netDebt,
    });
    const netDebtToUse = body.netDebt ?? synthetic.suggestedNetDebt;
    const model = await saveDCFModel(tenantId, pool, {
      companyName: body.companyName,
      cashFlows: body.cashFlows,
      terminalGrowthRate: body.terminalGrowthRate,
      wacc: body.wacc,
      netDebt: netDebtToUse,
      sharesOutstanding: body.sharesOutstanding ?? 1,
    }, body.assumptions);
    await recordObservation(pool, {
      tenantId,
      periodLabel: periodLabel ?? undefined,
      eventType: 'cfa_recommendation',
      deterministicFlagSnapshot: {
        source: 'dcf',
        terminalGrowthRate: body.terminalGrowthRate,
        wacc: body.wacc,
        equityValue: model.equityValue,
        valuePerShare: model.valuePerShare,
      },
    });
    if (periodLabel) {
      await lastDcfRepo.upsert(pool, tenantId, periodLabel, body.terminalGrowthRate);
    }
    const valuationPrompts = await getPromptsForValuation(tenantId, periodLabel, pool ?? undefined);
    res.status(201).json({
      ...(synthetic.professionalDisclaimer && { professionalDisclaimer: synthetic.professionalDisclaimer }),
      ...model,
      valuationPrompts,
      suggestedNetDebt: synthetic.suggestedNetDebt,
      hasEmbeddedLeaseFlag: synthetic.hasEmbeddedLeaseFlag,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (e instanceof Error && (e.message === DCF_GORDON_VALIDATION_ERROR || e.message.startsWith('Terminal growth rate'))) {
      res.status(400).json({ error: 'DCF validation failed', message });
      return;
    }
    res.status(500).json({ error: 'Create DCF model failed', message });
  }
});

/** POST /api/valuation/dcf/calculate — Calculate DCF without saving */
router.post('/dcf/calculate', validateBody(calculateDCFSchema), async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const periodLabel = body.periodLabel ?? (req.query.periodLabel as string | undefined);

    if (tenantId && pool && periodLabel) {
      const freshness = await assertFreshnessForValuation(pool, tenantId, periodLabel);
      if (!freshness.allowed) {
        res.status(freshness.status).json({
          error: freshness.message,
          code: freshness.code,
          message: freshness.message,
        });
        return;
      }
    }

    let netDebt = body.netDebt;
    let suggestedNetDebt: number | undefined;
    let hasEmbeddedLeaseFlag = false;
    if (tenantId && pool && periodLabel) {
      const synthetic = await getSyntheticNetDebt({
        tenantId,
        pool,
        periodLabel,
        reportedNetDebt: body.netDebt,
      });
      if (netDebt == null) netDebt = synthetic.suggestedNetDebt;
      suggestedNetDebt = synthetic.suggestedNetDebt;
      hasEmbeddedLeaseFlag = synthetic.hasEmbeddedLeaseFlag;
    }
    let result;
    try {
      result = calculateDCF({
        companyName: body.companyName,
        cashFlows: body.cashFlows,
        terminalGrowthRate: body.terminalGrowthRate,
        wacc: body.wacc,
        netDebt: netDebt ?? 0,
        sharesOutstanding: body.sharesOutstanding ?? 1,
      });
    } catch (calcErr) {
      const msg = calcErr instanceof Error ? calcErr.message : String(calcErr);
      if (calcErr instanceof Error && (calcErr.message === DCF_GORDON_VALIDATION_ERROR || calcErr.message.startsWith('Terminal growth rate'))) {
        res.status(400).json({ error: 'DCF validation failed', message: msg });
        return;
      }
      throw calcErr;
    }
    if (tenantId && pool) {
      await recordObservation(pool, {
        tenantId,
        periodLabel: periodLabel ?? undefined,
        eventType: 'cfa_recommendation',
        deterministicFlagSnapshot: {
          source: 'dcf',
          terminalGrowthRate: body.terminalGrowthRate,
          wacc: body.wacc,
          equityValue: result.equityValue,
          valuePerShare: result.valuePerShare,
        },
      });
      if (periodLabel) {
        await lastDcfRepo.upsert(pool, tenantId, periodLabel, body.terminalGrowthRate);
      }
    }
    const valuationPrompts = tenantId ? await getPromptsForValuation(tenantId, periodLabel, pool ?? undefined) : [];
    res.json({
      ...(professionalDisclaimer && { professionalDisclaimer }),
      ...result,
      valuationPrompts,
      ...(suggestedNetDebt != null && { suggestedNetDebt }),
      ...(hasEmbeddedLeaseFlag && { hasEmbeddedLeaseFlag: true }),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'DCF calculation failed', message });
  }
});

/** GET /api/valuation/dcf — List DCF models */
router.get('/dcf', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const models = await listDCFModels(tenantId, pool);
    res.json({ models });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'List models failed', message });
  }
});

/** GET /api/valuation/dcf/:id — Get a specific DCF model */
router.get('/dcf/:id', validateParams(dcfModelIdParamSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const model = await getDCFModel(tenantId, pool, id);
    if (!model) {
      res.status(404).json({ error: 'Model not found' });
      return;
    }
    res.json(model);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Get model failed', message });
  }
});

/** DELETE /api/valuation/dcf/:id — Delete a DCF model */
router.delete('/dcf/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id;
    if (!tenantId || !pool || !id) {
      res.status(400).json({ error: 'Tenant context and ID required' });
      return;
    }
    const deleted = await deleteDCFModel(tenantId, pool, id);
    if (!deleted) {
      res.status(404).json({ error: 'Model not found' });
      return;
    }
    res.json({ success: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Delete model failed', message });
  }
});

/** POST /api/valuation/dcf/wacc — Calculate and save WACC */
router.post('/dcf/wacc', validateBody(waccInputSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const body = req.body;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    
    const waccCalc = await saveWACCCalculation(tenantId, pool, body, body.dcfModelId, body.rationale);
    res.status(201).json(waccCalc);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'WACC calculation failed', message });
  }
});

/** POST /api/valuation/dcf/wacc/calculate — Calculate WACC without saving */
router.post('/dcf/wacc/calculate', validateBody(calculateWACCSchema), (req: Request, res: Response) => {
  try {
    const body = req.body;
    const wacc = calculateWACC(body);
    const costOfEquity = body.riskFreeRate + body.beta * body.marketRiskPremium;
    res.json({ wacc, costOfEquity, components: body });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'WACC calculation failed', message });
  }
});

/** GET /api/valuation/dcf/wacc — List WACC calculations */
router.get('/dcf/wacc', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const dcfModelId = req.query.dcfModelId as string | undefined;
    const calculations = await listWACCCalculations(tenantId, pool, dcfModelId);
    res.json({ calculations });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'List WACC failed', message });
  }
});

/** POST /api/valuation/dcf/sensitivity — Perform and save sensitivity analysis */
router.post('/dcf/sensitivity', validateBody(sensitivityAnalysisSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const body = req.body;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    
    const result = performSensitivityAnalysis({
      baseCashFlows: body.baseCashFlows,
      baseWACC: body.baseWACC,
      baseGrowthRate: body.baseGrowthRate,
      netDebt: body.netDebt ?? 0,
      sharesOutstanding: body.sharesOutstanding ?? 1,
      waccRange: body.waccRange,
      growthRange: body.growthRange,
    });
    
    // Save if dcfModelId provided
    if (body.dcfModelId) {
      await saveSensitivityAnalysis(tenantId, pool, body.dcfModelId, result);
    }
    
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Sensitivity analysis failed', message });
  }
});

/** GET /api/valuation/dcf/:id/sensitivity — Get sensitivity for a model */
router.get('/dcf/:id/sensitivity', validateParams(dcfModelIdParamSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const sensitivity = await getSensitivityAnalysis(tenantId, pool, id);
    if (!sensitivity) {
      res.status(404).json({ error: 'Sensitivity not found' });
      return;
    }
    res.json(sensitivity);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Get sensitivity failed', message });
  }
});

/** POST /api/valuation/dcf/project-revenue — Agentic revenue forecast. Fetches CPA Historical Snapshot when tenantId + periodLabel provided. */
router.post('/dcf/project-revenue', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (!body?.historicals) {
      res.status(400).json({ error: 'Missing historicals' });
      return;
    }
    const tenantId = getTenantId(req);
    const periodLabel = body.periodLabel ?? (req.query.periodLabel as string | undefined);
    const pool = getTenantPool(req);
    const snapshot =
      tenantId && periodLabel && pool
        ? await getHistoricalSnapshotFromCPA(tenantId, periodLabel, pool)
        : null;
    const accountingContext = snapshot ? formatAccountingContextBlock(snapshot) : undefined;
    const result = await projectRevenueAgentic(
      body.historicals,
      body.guidance,
      body.industry,
      accountingContext
    );
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Revenue projection failed', message });
  }
});

/** POST /api/valuation/dcf/project-margins — Agentic margin forecast. Fetches CPA Historical Snapshot when tenantId + periodLabel provided. */
router.post('/dcf/project-margins', validateBody(projectMarginsSchema), async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const tenantId = getTenantId(req);
    const periodLabel = body.periodLabel ?? (req.query.periodLabel as string | undefined);
    const pool = getTenantPool(req);
    const snapshot =
      tenantId && periodLabel && pool
        ? await getHistoricalSnapshotFromCPA(tenantId, periodLabel, pool)
        : null;
    const accountingContext = snapshot ? formatAccountingContextBlock(snapshot) : undefined;
    const result = await projectMarginsAgentic(
      body.historicalMargins,
      body.projectedRevenue,
      body.industry,
      accountingContext
    );
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Margin projection failed', message });
  }
});

/** POST /api/valuation/dcf/suggest-wacc — Agentic WACC calculation */
router.post('/dcf/suggest-wacc', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (!body?.industry) {
      res.status(400).json({ error: 'Missing industry' });
      return;
    }
    const result = await calculateWACCAgentic({
      ticker: body.ticker,
      industry: body.industry,
      creditRating: body.creditRating,
      debtToEquity: body.debtToEquity,
    });
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'WACC suggestion failed', message });
  }
});

/** POST /api/valuation/dcf/suggest-growth — Agentic terminal growth suggestion. Fetches CPA Historical Snapshot when tenantId + periodLabel provided. */
router.post('/dcf/suggest-growth', validateBody(suggestGrowthSchema), async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const tenantId = getTenantId(req);
    const periodLabel = body.periodLabel ?? (req.query.periodLabel as string | undefined);
    const pool = getTenantPool(req);
    const snapshot =
      tenantId && periodLabel && pool
        ? await getHistoricalSnapshotFromCPA(tenantId, periodLabel, pool)
        : null;
    const accountingContext = snapshot ? formatAccountingContextBlock(snapshot) : undefined;
    const result = await suggestTerminalGrowthAgentic(
      body.industry,
      body.currentGrowthRate ?? 0.05,
      accountingContext
    );
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Growth suggestion failed', message });
  }
});

/** POST /api/valuation/dcf/suggest-beta — Agentic beta suggestion */
router.post('/dcf/suggest-beta', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (!body?.industry) {
      res.status(400).json({ error: 'Missing industry' });
      return;
    }
    const result = await suggestBetaAgentic(body.industry, body.companySize ?? 'mid');
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Beta suggestion failed', message });
  }
});

/** POST /api/valuation/dcf/summary — Agentic valuation summary. Fetches CPA Historical Snapshot when tenantId + periodLabel provided. */
router.post('/dcf/summary', validateBody(generateValuationSummarySchema), async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const tenantId = getTenantId(req);
    const periodLabel = body.periodLabel ?? (req.query.periodLabel as string | undefined);
    const pool = getTenantPool(req);
    const snapshot =
      tenantId && periodLabel && pool
        ? await getHistoricalSnapshotFromCPA(tenantId, periodLabel, pool)
        : null;
    const accountingContext = snapshot ? formatAccountingContextBlock(snapshot) : undefined;
    const result = await generateValuationSummaryAgentic(body.dcfResult, accountingContext);
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Summary generation failed', message });
  }
});

export default router;
