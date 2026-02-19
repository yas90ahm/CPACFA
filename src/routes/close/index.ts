/**
 * Close routes aggregate: mounts all close sub-routers at /api/close (no path prefix here).
 * Each sub-router defines full paths (e.g. /adjustments, /period-lock) so combined paths stay identical.
 */

import { Router } from 'express';
import closeJeAccrualsRouter from './close_je_accruals.js';
import closeChecklistRouter from './close_checklist.js';
import closePeriodRouter from './close_period.js';
import closeReconciliationRouter from './close_reconciliation.js';
import closeControlsRouter from './close_controls.js';
import closeMaterialityDisclosureRouter from './close_materiality_disclosure.js';
import closeSignoffReadinessRouter from './close_signoff_readiness.js';
import closeOnePagerExceptionsRouter from './close_one_pager_exceptions.js';
import closePackageRouter from './close_package.js';
import closeAdjustmentsRouter from './close_adjustments.js';
import closeClosingEntriesRouter from './close_closing_entries.js';
import closeAuditLogRouter from './close_audit_log.js';
import closeSegregationRouter from './close_segregation.js';
import closeTaskAssignRouter from './close_task_assign.js';
import closeSessionsRouter from './close_sessions.js';
import closeIssuesRouter from './close_issues.js';
import closeDecisionRecordsRouter from './close_decision_records.js';
import closeReconRunsRouter from './close_recon_runs.js';
import closeJournalEntriesRouter from './close_journal_entries.js';
import closeEvidencePolicyRouter from './close_evidence_policy.js';
import closeReconRequirementsRouter from './close_recon_requirements.js';
import closePeriodReconciliationsRouter from './close_period_reconciliations.js';
import closeAjeTemplatesRouter from './close_aje_templates.js';
import closeVarianceAnalysisRouter from './close_variance_analysis.js';

const router = Router();
router.use(closeJeAccrualsRouter);
router.use(closeSessionsRouter);
router.use(closeIssuesRouter);
router.use(closeDecisionRecordsRouter);
router.use(closeReconRunsRouter);
router.use(closeReconRequirementsRouter);
router.use(closePeriodReconciliationsRouter);
router.use(closeAjeTemplatesRouter);
router.use(closeVarianceAnalysisRouter);
router.use(closeJournalEntriesRouter);
router.use(closeEvidencePolicyRouter);
router.use(closeChecklistRouter);
router.use(closePeriodRouter);
router.use(closeReconciliationRouter);
router.use(closeControlsRouter);
router.use(closeMaterialityDisclosureRouter);
router.use(closeSignoffReadinessRouter);
router.use(closeOnePagerExceptionsRouter);
router.use(closePackageRouter);
router.use(closeAdjustmentsRouter);
router.use(closeClosingEntriesRouter);
router.use(closeAuditLogRouter);
router.use(closeSegregationRouter);
router.use(closeTaskAssignRouter);

export default router;
