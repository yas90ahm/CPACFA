/**
 * Audit routes aggregate: mounts all audit sub-routers at /api/audit (no path prefix here).
 * Each sub-router defines full paths (e.g. /binder, /reconciliation-summary) so combined paths stay identical.
 */

import { Router } from 'express';
import auditBinderRouter from './audit_binder.js';
import auditReconciliationRouter from './audit_reconciliation.js';
import auditGaapPolicyRouter from './audit_gaap_policy.js';
import auditTodosRouter from './audit_todos.js';
import auditAuditorRouter from './audit_auditor.js';
import auditForensicsRouter from './audit_forensics.js';
import auditDrlRouter from './audit_drl.js';
import auditSamplingRouter from './audit_sampling.js';
import auditPbcRouter from './audit_pbc.js';
import auditPriorPeriodRouter from './audit_prior_period.js';
import auditProfessionalReviewRouter from './audit_professional_review.js';
import auditEngagementsRouter from './audit_engagements.js';
import auditArtifactsRouter from './audit_artifacts.js';

const router = Router();
router.use(auditBinderRouter);
router.use(auditReconciliationRouter);
router.use(auditGaapPolicyRouter);
router.use(auditTodosRouter);
router.use(auditAuditorRouter);
router.use(auditForensicsRouter);
router.use(auditDrlRouter);
router.use(auditSamplingRouter);
router.use(auditPbcRouter);
router.use(auditPriorPeriodRouter);
router.use(auditProfessionalReviewRouter);
router.use(auditEngagementsRouter);
router.use(auditArtifactsRouter);

export default router;
