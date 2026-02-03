/**
 * Audit prior-period comparison routes: prior-period-comparison, prior-period-comparison/explain.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { loadCloseContext, requirePriorPeriodForComparison, isPriorPeriodBeforeCurrent } from '../../services/close_context.js';
import { getPrecedentForCloseStep, toSimilarPrecedentSummary } from '../../services/precedent_for_close_step.js';
import { getMateriality, materialityThresholdFromSettings } from '../../services/materiality_service.js';
import { buildPriorPeriodComparison } from '../../services/agentic_prior_period_comparison.js';
import { explainPriorPeriodComparisonAgentic } from '../../services/agentic_prior_period_comparison.js';
import type { PriorPeriodComparisonInput, PriorPeriodComparisonResult } from '../../types/audit_evidence.js';
import { validateBody } from '../../middleware/validationMiddleware.js';
import { priorPeriodComparisonBodySchema, priorPeriodExplainBodySchema } from '../../schemas/auditSchemas.js';
import { handleAuditError } from './audit_shared.js';

const router = Router();

/** POST /api/audit/prior-period-comparison */
router.post('/prior-period-comparison', validateBody(priorPeriodComparisonBodySchema), async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (!isPriorPeriodBeforeCurrent(body.priorPeriodLabel, body.currentPeriodLabel)) {
      res.status(400).json({
        error: 'Prior period must be before current period.',
        message: 'priorPeriodLabel must be temporally before currentPeriodLabel (e.g. 2023-Q4 before 2024-Q1).',
      });
      return;
    }
    const priorRequiredErr = requirePriorPeriodForComparison(body.priorPeriodLabel, undefined, body.priorLines);
    if (priorRequiredErr) {
      res.status(400).json({ error: 'Prior period data required.', message: priorRequiredErr });
      return;
    }
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    let priorSnapshot: import('../../types/kpi_history.js').KPISnapshot | undefined;
    if (pool && tenantId && body.priorPeriodLabel) {
      const closeCtx = await loadCloseContext({
        pool,
        tenantId,
        entityId: body.entityId ?? '',
        currentPeriodLabel: body.currentPeriodLabel,
        priorPeriodLabel: body.priorPeriodLabel,
      });
      priorSnapshot = closeCtx.priorSnapshot;
    }
    const settings = getMateriality(tenantId, body.currentPeriodLabel);
    const th = materialityThresholdFromSettings(settings);
    const result = buildPriorPeriodComparison(body, {
      materialThresholdPercent: th.percent,
      materialThresholdAmount: th.amount,
    });
    const precedentResult = getPrecedentForCloseStep('prior_period_comparison', {
      entityId: body.entityId,
      currentPeriodLabel: body.currentPeriodLabel,
      priorPeriodLabel: body.priorPeriodLabel,
    });
    const similarPrecedent = toSimilarPrecedentSummary('prior_period_comparison', precedentResult);
    if (priorSnapshot != null) {
      res.json({ ...result, priorSnapshot, similarPrecedent });
    } else {
      res.json({ ...result, similarPrecedent });
    }
  } catch (err) {
    handleAuditError(res, err, 'Prior-period error');
  }
});

/** POST /api/audit/prior-period-comparison/explain */
router.post('/prior-period-comparison/explain', validateBody(priorPeriodExplainBodySchema), async (req: Request, res: Response) => {
  try {
    const narrative = await explainPriorPeriodComparisonAgentic(req.body);
    res.json({ narrative });
  } catch (err) {
    handleAuditError(res, err, 'Explain error');
  }
});

export default router;
