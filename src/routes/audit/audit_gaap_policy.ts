/**
 * Audit GAAP / policy routes: gaap-consistency, policy-change, policy-changes.
 */

import { Router, type Request, type Response } from 'express';
import { buildGAAPConsistencyReport, recordPolicyChange, getRecordedPolicyChanges } from '../../services/audit_export_service.js';
import { validateBody } from '../../middleware/validationMiddleware.js';
import { policyChangeBodySchema } from '../../schemas/auditSchemas.js';
import { handleAuditError } from './audit_shared.js';

const router = Router();

/** GET /api/audit/gaap-consistency */
router.get('/gaap-consistency', (req: Request, res: Response) => {
  try {
    const periodStart = (req.query.periodStart as string) ?? new Date().toISOString().slice(0, 10);
    const periodEnd = (req.query.periodEnd as string) ?? new Date().toISOString().slice(0, 10);
    const report = buildGAAPConsistencyReport({ periodStart, periodEnd });
    res.json(report);
  } catch (err) {
    handleAuditError(res, err, 'GAAP report error');
  }
});

/** POST /api/audit/policy-change */
router.post('/policy-change', validateBody(policyChangeBodySchema), (req: Request, res: Response) => {
  try {
    const body = req.body;
    const record = recordPolicyChange({
      effectiveDate: body.effectiveDate,
      policyArea: body.policyArea,
      changeDescription: body.changeDescription,
      citation: body.citation,
      eventType: body.eventType,
      reasoning: body.reasoning,
    });
    res.status(201).json(record);
  } catch (err) {
    handleAuditError(res, err, 'Policy change error');
  }
});

/** GET /api/audit/policy-changes */
router.get('/policy-changes', (_req: Request, res: Response) => {
  try {
    const list = getRecordedPolicyChanges();
    res.json({ policyChanges: list });
  } catch (err) {
    handleAuditError(res, err, 'List error');
  }
});

export default router;
