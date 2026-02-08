/**
 * Trial Balance classification and narratives — classification-suggestions, apply-classification, confirm-standard, narratives.
 */

import { Router, type Request, type Response } from 'express';
import { updatePolicyMemory } from '../../memory/index.js';
import { recordPolicyChange } from '../../services/audit_export_service.js';
import { validateBody } from '../../middleware/validationMiddleware.js';
import {
  classificationSuggestionsBodySchema,
  type ClassificationSuggestionsBody,
  applyClassificationBodySchema,
  type ApplyClassificationBody,
} from '../../schemas/request/trialBalance.js';
import {
  cashFlowNarrativeBodySchema,
  notesNarrativeBodySchema,
  confirmStandardBodySchema,
  equityChangesNarrativeBodySchema,
  type CashFlowNarrativeBody,
  type NotesNarrativeBody,
  type ConfirmStandardBody,
  type EquityChangesNarrativeBody,
} from '../../schemas/trialBalanceSchemas.js';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { send500 } from '../../lib/errorHandler.js';
import { getClassificationSuggestions, applyUserClassificationOverrides } from '../../services/accountClassifier.js';
import { generateCashFlowNarrativeAgentic } from '../../services/agentic_cash_flow_narrative.js';
import { generateNotesNarrativeAgentic } from '../../services/agentic_notes_narrative.js';
import { generateEquityChangesNarrativeAgentic } from '../../services/agentic_equity_changes_narrative.js';
import type { TrialBalanceEntry } from '../../types/financial.js';

const router = Router();

/** POST /api/trial-balance/classification-suggestions */
router.post('/classification-suggestions', validateBody(classificationSuggestionsBodySchema), async (req: Request, res: Response) => {
  try {
    const body: ClassificationSuggestionsBody = req.body;
    const entries: TrialBalanceEntry[] = body.entries.map((e) => ({
      accountName: e.accountName,
      debit: e.debit,
      credit: e.credit,
    }));
    const result = await getClassificationSuggestions(entries);
    res.json(result);
  } catch (e) {
    send500(res, e, 'Classification suggestions failed');
  }
});

/** POST /api/trial-balance/apply-classification */
router.post('/apply-classification', validateBody(applyClassificationBodySchema), async (req: Request, res: Response) => {
  try {
    const body: ApplyClassificationBody = req.body;
    const entries: TrialBalanceEntry[] = body.entries.map((e) => ({
      accountName: e.accountName,
      debit: e.debit,
      credit: e.credit,
    }));
    const classified = applyUserClassificationOverrides(entries, body.overrides);
    res.json({ entries: classified });
  } catch (e) {
    send500(res, e, 'Apply classification failed');
  }
});

/** POST /api/trial-balance/confirm-standard */
router.post('/confirm-standard', validateBody(confirmStandardBodySchema), async (req: Request, res: Response) => {
  try {
    const body: ConfirmStandardBody = req.body;
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const opts = pool && tenantId ? { pool, tenantId } : undefined;
    await updatePolicyMemory(body.entityId, { standard: body.standard }, body.fiscalYear, opts);
    recordPolicyChange({
      effectiveDate: body.fiscalYear ? `${body.fiscalYear}-01-01` : new Date().toISOString().slice(0, 10),
      policyArea: 'Reporting standard',
      changeDescription: `Standard confirmed: ${body.standard} for entity ${body.entityId}${body.fiscalYear ? ` (fiscal ${body.fiscalYear})` : ''}.`,
      eventType: 'accounting_policy_change',
      reasoning: 'User confirmed via confirm-standard API.',
    });
    res.json({ ok: true, message: 'Standard confirmed; retry statement generation.' });
  } catch (e) {
    send500(res, e, 'Confirm standard failed');
  }
});

/** POST /api/trial-balance/cash-flow-narrative */
router.post('/cash-flow-narrative', validateBody(cashFlowNarrativeBodySchema), async (req: Request, res: Response) => {
  try {
    const body: CashFlowNarrativeBody = req.body;
    const narrative = await generateCashFlowNarrativeAgentic(
      body.cashFlowStatement as import('../../types/financial.js').CashFlowStatement,
      body.periodLabel
    );
    res.json({ narrative });
  } catch (e) {
    send500(res, e, 'Cash flow narrative failed');
  }
});

/** POST /api/trial-balance/notes-narrative */
router.post('/notes-narrative', validateBody(notesNarrativeBodySchema), async (req: Request, res: Response) => {
  try {
    const body: NotesNarrativeBody = req.body;
    const narrative = await generateNotesNarrativeAgentic(body.standard, body.context);
    res.json({ narrative });
  } catch (e) {
    send500(res, e, 'Notes narrative failed');
  }
});

/** POST /api/trial-balance/equity-changes-narrative */
router.post('/equity-changes-narrative', validateBody(equityChangesNarrativeBodySchema), async (req: Request, res: Response) => {
  try {
    const body: EquityChangesNarrativeBody = req.body;
    const narrative = await generateEquityChangesNarrativeAgentic(
      body.equityChangesStatement as unknown as import('../../types/financial.js').EquityChangesStatement
    );
    res.json({ narrative });
  } catch (e) {
    send500(res, e, 'Equity changes narrative failed');
  }
});

export default router;
