/**
 * Audit professional review routes: professional-review, integrity/validate, professional-review/flags, professional-review/flags/:id.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { buildProfessionalReviewInput } from '../../services/professional_review_input_builder.js';
import { runProfessionalReview } from '../../services/professional_review_service.js';
import { runIntegrityGate } from '../../services/integrity_gate_service.js';
import { IntegrityGateViolation } from '../../types/integrity.js';
import { classifyTrialBalanceDeterministic } from '../../services/accountClassifier.js';
import * as professionalAuditFlagsRepo from '../../db/repositories/professional_audit_flags_repository.js';
import type { ProfessionalAuditFlagCategory, ProfessionalAuditFlagStatus } from '../../types/professional_review.js';
import { validateBody } from '../../middleware/validationMiddleware.js';
import { professionalReviewBodySchema, integrityValidateBodySchema, professionalReviewFlagUpdateBodySchema } from '../../schemas/auditSchemas.js';
import { handleAuditError } from './audit_shared.js';

const router = Router();

/** POST /api/audit/professional-review */
router.post('/professional-review', validateBody(professionalReviewBodySchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required (tenantId, pool)' });
      return;
    }
    const body = req.body;
    const input = await buildProfessionalReviewInput({ body, tenantId, pool });
    const response = await runProfessionalReview(input, pool);
    res.json(response);
  } catch (err) {
    handleAuditError(res, err, 'Professional review error');
  }
});

/** POST /api/audit/integrity/validate */
router.post('/integrity/validate', validateBody(integrityValidateBodySchema), async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const classified = body.entries.every((e) => e.accountType != null)
      ? body.entries as import('../../types/financial.js').TrialBalanceEntry[]
      : classifyTrialBalanceDeterministic(body.entries as import('../../types/financial.js').TrialBalanceEntry[]);
    const contracts = body.contracts.map((c) => ({
      id: c.id,
      totalContractValue: c.totalContractValue,
      periodRecognizedRevenue: c.periodRecognizedRevenue,
    }));
    const result = runIntegrityGate({
      trialBalanceEntries: classified,
      contracts,
      tolerance: body.tolerance,
    });
    res.json(result);
  } catch (err) {
    if (err instanceof IntegrityGateViolation) {
      res.status(400).json({
        error: 'INTEGRITY_VIOLATION',
        code: err.code,
        message: err.message,
        tbRevenue: err.tbRevenue,
        contractRevenue: err.contractRevenue,
        variance: err.variance,
      });
      return;
    }
    handleAuditError(res, err, 'Integrity error');
  }
});

/** GET /api/audit/professional-review/flags */
router.get('/professional-review/flags', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const periodLabel = req.query.periodLabel as string | undefined;
    const runId = req.query.runId as string | undefined;
    const category = req.query.category as ProfessionalAuditFlagCategory | undefined;
    const status = req.query.status as ProfessionalAuditFlagStatus | undefined;
    const list = await professionalAuditFlagsRepo.list(pool, tenantId, {
      periodLabel,
      runId,
      category,
      status,
      limit: 100,
    });
    res.json({ flags: list });
  } catch (err) {
    handleAuditError(res, err, 'Flags error');
  }
});

/** PATCH /api/audit/professional-review/flags/:id */
router.patch('/professional-review/flags/:id', validateBody(professionalReviewFlagUpdateBodySchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id;
    const body = req.body;
    if (!id) {
      res.status(400).json({ error: 'Flag id required' });
      return;
    }
    const userRationale = (body.note ?? body.userRationale ?? '').trim();
    const flag = await professionalAuditFlagsRepo.get(pool, id, tenantId);
    if (!flag) {
      res.status(404).json({ error: 'Flag not found' });
      return;
    }
    const isVarianceOverride =
      flag.category === 'integrity_variance' ||
      /variance|integrity/i.test(flag.message ?? '') ||
      /variance|integrity/i.test(flag.recommendation ?? '');
    const { recordOverride } = await import('../../services/audit_ledger_service.js');
    await recordOverride(pool, {
      tenantId,
      periodLabel: flag.periodLabel,
      eventType: isVarianceOverride ? 'user_induced_variance' : 'flag_override',
      deterministicFlagSnapshot: {
        flagId: flag.id,
        category: flag.category,
        severity: flag.severity,
        message: flag.message,
        recommendation: flag.recommendation,
        citationStandard: flag.citationStandard,
        statusBefore: flag.status,
      },
      agentDissentSnapshot: { recommendation: flag.recommendation, citationExcerpt: flag.citationExcerpt },
      userPromptRationale: userRationale,
      createdBy: body.status === 'resolved' ? body.resolvedBy : body.acknowledgedBy,
    });
    const updated = await professionalAuditFlagsRepo.updateStatus(pool, id, tenantId, {
      status: body.status,
      acknowledgedBy: body.acknowledgedBy,
      resolvedBy: body.resolvedBy,
      note: userRationale,
    });
    if (!updated) {
      res.status(404).json({ error: 'Flag not found' });
      return;
    }
    res.json(updated);
  } catch (err) {
    handleAuditError(res, err, 'Flag update error');
  }
});

export default router;
