/**
 * Task Decomposition API: "Prepare the Q4 Financials"
 * POST /api/orchestrator/prepare-q4 — runs plan, reconciliation worker, self-correction, returns structured JSON + Financial Health summary.
 */

import { Router, type Request, type Response } from 'express';
import { prepareQ4Financials, isPrepareFinancialsIntent } from '../services/orchestrator.js';
import { runLeadPartner } from '../services/lead_partner_orchestrator.js';
import { validateBody } from '../middleware/validationMiddleware.js';
import { prepareQ4BodySchema, intentBodySchema, leadPartnerBodySchema } from '../schemas/orchestratorSchemas.js';

const router = Router();

/**
 * POST /api/orchestrator/prepare-q4
 * Body: { rawRows?, entries?, bankStatementBalance?, periodLabel? }
 * Returns: Q4FinancialsOutput — plan, trialBalance, balanceSheet, profitAndLoss, reconciliation, selfCorrection?, cfaRatios?, financialHealthSummary.
 */
router.post('/prepare-q4', validateBody(prepareQ4BodySchema), async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const output = await prepareQ4Financials({
      rawRows: body.rawRows,
      entries: body.entries,
      bankStatementBalance: body.bankStatementBalance,
      periodLabel: body.periodLabel,
    });
    res.json(output);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Prepare Q4 failed';
    res.status(500).json({ error: 'Prepare Q4 error', message });
  }
});

/**
 * POST /api/orchestrator/intent
 * Body: { query?: string }
 * Returns: { isPrepareFinancials: boolean } — true if user intent is "Prepare the Q4 Financials" (or similar).
 */
router.post('/intent', validateBody(intentBodySchema), (req: Request, res: Response) => {
  try {
    const body = req.body;
    const query = (body.query ?? '').trim();
    const isPrepareFinancials = isPrepareFinancialsIntent(query);
    res.json({ isPrepareFinancials });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Intent check failed';
    res.status(500).json({ error: 'Intent error', message });
  }
});

/**
 * POST /api/orchestrator/lead-partner
 * Lead Partner CoT protocol: Deconstruction (CPA/CFA sub-tasks), Capability Assessment (Python, RAG, ERP),
 * Conflict Resolution (e.g. Market vs. Historical Cost), Self-Correction (reasonability check).
 * Body: { query (required), rawRows?, entries?, bankStatementBalance?, periodLabel?, balanceSheet?, profitAndLoss?, dcfInputs?, cfoView? }
 * Returns: thought_process, thought_process_xml, final_answer, cpa_sub_tasks, cfa_sub_tasks, tools_used, conflict_variance?, reasonability_checks.
 */
router.post('/lead-partner', validateBody(leadPartnerBodySchema), async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const output = await runLeadPartner({
      query: body.query,
      rawRows: body.rawRows,
      entries: body.entries,
      bankStatementBalance: body.bankStatementBalance,
      periodLabel: body.periodLabel,
      balanceSheet: body.balanceSheet,
      profitAndLoss: body.profitAndLoss,
      dcfInputs: body.dcfInputs,
      cfoView: body.cfoView,
    });
    res.json(output);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lead Partner failed';
    res.status(500).json({ error: 'Lead Partner error', message });
  }
});

export default router;
