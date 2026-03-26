/**
 * Audit routes aggregate: mounts all audit sub-routers at /api/audit (no path prefix here).
 * Each sub-router defines full paths (e.g. /binder, /reconciliation-summary) so combined paths stay identical.
 * Scope: Pilot keeps binder, reconciliation, gaap-policy, todos, auditor, forensics, professional-review.
 * DRL, sampling, PBC, prior-period, engagements, artifacts are quarantined (unmounted) per DEAD_CODE_AND_PURGE_PLAN.
 */

import { Router } from 'express';
import auditBinderRouter from './audit_binder.js';
import auditReconciliationRouter from './audit_reconciliation.js';
import auditGaapPolicyRouter from './audit_gaap_policy.js';
import auditTodosRouter from './audit_todos.js';
import auditAuditorRouter from './audit_auditor.js';
import auditForensicsRouter from './audit_forensics.js';
import auditProfessionalReviewRouter from './audit_professional_review.js';
import pbcIndexRouter from './pbc_index.js';
import auditJeTraceRouter from './audit_je_trace.js';

const router = Router();
router.use(pbcIndexRouter);
router.use(auditJeTraceRouter);
router.use(auditBinderRouter);
router.use(auditReconciliationRouter);
router.use(auditGaapPolicyRouter);
router.use(auditTodosRouter);
router.use(auditAuditorRouter);
router.use(auditForensicsRouter);
router.use(auditProfessionalReviewRouter);

export default router;
