/**
 * Multi-entity and consolidation API.
 */

import { Router, type Request, type Response } from 'express';
import { buildConsolidation } from '../services/consolidation_service.js';
import { translateToReportingCurrency } from '../services/fx_translation_service.js';
import { reconcileEntityBalances } from '../services/gaap_reconciliation_service.js';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';
import { upsertPeriodExportChecks } from '../db/repositories/period_export_checks_repository.js';
import type { ConsolidationInput, ConsolidationResult } from '../types/multi_entity.js';

const router = Router();

/**
 * POST /api/entities/consolidation — Build consolidated view from entity balances + eliminations.
 * To run US GAAP to IFRS reconciliation (e.g. LIFO inventory adjustment), include in body:
 * gaapReconciliation: { standardFrom: 'US_GAAP', standardTo: 'IFRS' }.
 */
router.post('/consolidation', async (req: Request, res: Response) => {
  try {
    const body = req.body as ConsolidationInput;
    if (!body?.entities || !Array.isArray(body.entities) || !body?.entityBalances || !Array.isArray(body.entityBalances)) {
      res.status(400).json({ error: 'Missing entities or entityBalances' });
      return;
    }
    if (body.materiality !== undefined && body.materiality !== null) {
      res.status(400).json({
        error: 'Materiality cannot be supplied by client',
        message: 'Materiality cannot be supplied by client. Use server-side policy.',
      });
      return;
    }
    const { materiality: _omit, ...consolidationInput } = body;
    const result = buildConsolidation(consolidationInput as ConsolidationInput);

    let gaapAdjustments: ConsolidationResult['gaapAdjustments'] = undefined;
    let lifoInventoryFlag: boolean | undefined = undefined;
    if (body.gaapReconciliation?.standardFrom === 'US_GAAP' && body.gaapReconciliation?.standardTo === 'IFRS') {
      const allAdjustments: { reason: string; accountName: string; gaapAmount: number; ifrsAmount: number; citation?: string }[] = [];
      let anyLifo = false;
      for (const bal of body.entityBalances) {
        const gaapLines = bal.lines.map((l) => ({ accountName: l.accountName, amount: l.amount, side: l.side }));
        const gaapResult = reconcileEntityBalances(gaapLines, body.gaapReconciliation);
        allAdjustments.push(...gaapResult.adjustments);
        if (gaapResult.lifoInventoryFlag) anyLifo = true;
      }
      gaapAdjustments = allAdjustments.length > 0 ? allAdjustments : undefined;
      lifoInventoryFlag = anyLifo ? true : undefined;
    }

    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const periodLabel = body.periodLabel;
    if (tenantId && pool && periodLabel) {
      await upsertPeriodExportChecks(pool, tenantId, periodLabel, {
        roundingGapExceedsMateriality: result.roundingGapExceedsMateriality ?? false,
        aggregateRoundingExceedsMateriality: result.aggregateRoundingExceedsMateriality ?? false,
      });
    }
    res.json({
      ...result,
      ...(gaapAdjustments != null && { gaapAdjustments }),
      ...(lifoInventoryFlag != null && { lifoInventoryFlag }),
    });
  } catch (e) {
    res.status(500).json({
      error: 'Consolidation failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/entities/fx-translation — Translate amounts by currency to reporting currency */
router.post('/fx-translation', (req: Request, res: Response) => {
  try {
    const body = req.body as import('../services/fx_translation_service.js').FxTranslationInput;
    if (!body?.lines || !Array.isArray(body.lines) || !body?.reportingCurrency || !body?.fxRates || typeof body.fxRates !== 'object') {
      res.status(400).json({ error: 'Missing lines, reportingCurrency, or fxRates' });
      return;
    }
    const result = translateToReportingCurrency(body);
    res.json(result);
  } catch (e) {
    res.status(500).json({
      error: 'FX translation failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

export default router;
