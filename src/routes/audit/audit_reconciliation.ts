/**
 * Audit reconciliation routes: reconciliation-summary, reconciliation-tie-out, narrative, POST reconciliation-summary.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { buildReconciliationSummary } from '../../services/reconciliation_summary_service.js';
// QUARANTINED — Summary/reporting services not in MVP architecture
// import { buildReconciliationTieOut } from '../../services/reconciliation_tie_out_service.js';
// import { generateReconciliationNarrativeAgentic } from '../../services/agentic_reconciliation_narrative.js';
import { validateTrialBalanceAndBalanceSheet } from '../../services/financialStatements.js';
import { validateBody } from '../../middleware/validationMiddleware.js';
import { reconciliationSummaryBodySchema } from '../../schemas/auditSchemas.js';
import { handleAuditError, handleAuditOrIntegrityError } from './audit_shared.js';

const router = Router();

/** GET /api/audit/reconciliation-summary */
router.get('/reconciliation-summary', async (req: Request, res: Response) => {
  try {
    const summary = await buildReconciliationSummary(null, getTenantId(req), getTenantPool(req));
    if (!summary) {
      res.status(404).json({
        error: 'No statement generation registered',
        message: 'Upload a trial balance and generate statements first, or POST with statements in body.',
      });
      return;
    }
    // QUARANTINED — Agentic narrative not in MVP architecture
    // const includeNarrative = String(req.query.includeNarrative ?? '') === 'true';
    const payload: Record<string, unknown> = { ...summary };
    // if (includeNarrative) {
    //   payload.narrative = await generateReconciliationNarrativeAgentic(summary);
    // }
    res.json(payload);
  } catch (err) {
    handleAuditOrIntegrityError(res, err, 'Reconciliation error');
  }
});

// QUARANTINED — Summary/reporting endpoints not in MVP architecture
// /** GET /api/audit/reconciliation-tie-out */
// router.get('/reconciliation-tie-out', async (req: Request, res: Response) => {
//   try {
//     const periodLabel = req.query.periodLabel as string;
//     const tenantId = getTenantId(req);
//     const pool = getTenantPool(req);
//     if (!periodLabel || !tenantId) {
//       res.status(400).json({ error: 'Missing periodLabel query or tenant context' });
//       return;
//     }
//     const tieOut = await buildReconciliationTieOut(tenantId, periodLabel, pool ?? undefined);
//     res.json(tieOut);
//   } catch (err) {
//     handleAuditError(res, err, 'Reconciliation error');
//   }
// });

// /** POST /api/audit/reconciliation-summary/narrative */
// router.post('/reconciliation-summary/narrative', async (req: Request, res: Response) => {
//   try {
//     const summary = await buildReconciliationSummary(null, getTenantId(req), getTenantPool(req));
//     if (!summary) {
//       res.status(404).json({
//         error: 'No statement generation registered',
//         message: 'Build reconciliation summary first.',
//       });
//       return;
//     }
//     const narrative = await generateReconciliationNarrativeAgentic(summary);
//     res.json({ narrative });
//   } catch (err) {
//     handleAuditError(res, err, 'Reconciliation error');
//   }
// });

/** POST /api/audit/reconciliation-summary */
router.post('/reconciliation-summary', validateBody(reconciliationSummaryBodySchema), async (req: Request, res: Response) => {
  try {
    const statements = req.body.statements as Parameters<typeof buildReconciliationSummary>[0];
    if (statements?.balanceSheet && statements?.trialBalance != null) {
      validateTrialBalanceAndBalanceSheet(
        statements.trialBalance as { entries: import('../../types/financial.js').TrialBalanceEntry[]; totalDebits?: number; totalCredits?: number },
        statements.balanceSheet
      );
    }
    const summary = await buildReconciliationSummary(statements, getTenantId(req), getTenantPool(req));
    if (!summary) {
      res.status(404).json({
        error: 'No statements',
        message: 'Provide statements in body or register a statement generation first.',
      });
      return;
    }
    res.json(summary);
  } catch (err) {
    handleAuditOrIntegrityError(res, err, 'Reconciliation error');
  }
});

export default router;
