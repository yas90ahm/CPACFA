/**
 * Task Decomposition API: "Prepare the Q4 Financials"
 * POST /api/orchestrator/prepare-q4 — runs plan, reconciliation worker, self-correction, returns structured JSON + Financial Health summary.
 */

import { Router, type Request, type Response } from 'express';
import { prepareQ4Financials, isPrepareFinancialsIntent } from '../services/orchestrator.js';
import { runLeadPartner, type LeadPartnerInput } from '../services/lead_partner_orchestrator.js';
import type { RawTrialBalanceRow } from '../services/trialBalanceParser.js';
import type { TrialBalanceEntry } from '../types/financial.js';
import type { DCFInputs } from '../types/analysis.js';

const router = Router();

/**
 * POST /api/orchestrator/prepare-q4
 * Body: { rawRows?: RawTrialBalanceRow[], entries?: TrialBalanceEntry[], bankStatementBalance?: number, periodLabel?: string }
 * Returns: Q4FinancialsOutput — plan, trialBalance, balanceSheet, profitAndLoss, reconciliation, selfCorrection?, cfaRatios?, financialHealthSummary.
 */
router.post('/prepare-q4', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      rawRows?: RawTrialBalanceRow[];
      entries?: TrialBalanceEntry[];
      bankStatementBalance?: number;
      periodLabel?: string;
    };
    const output = await prepareQ4Financials({
      rawRows: body?.rawRows,
      entries: body?.entries,
      bankStatementBalance: body?.bankStatementBalance,
      periodLabel: body?.periodLabel,
    });
    res.json(output);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Prepare Q4 failed';
    res.status(500).json({ error: 'Prepare Q4 error', message });
  }
});

/**
 * POST /api/orchestrator/intent
 * Body: { query: string }
 * Returns: { isPrepareFinancials: boolean } — true if user intent is "Prepare the Q4 Financials" (or similar).
 */
router.post('/intent', (req: Request, res: Response) => {
  try {
    const body = req.body as { query?: string };
    const query = (body?.query ?? '').trim();
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
 * Body: { query: string, rawRows?, entries?, bankStatementBalance?, periodLabel?, balanceSheet?, profitAndLoss?, dcfInputs? }
 * Returns: thought_process, thought_process_xml (<thought_process>...</thought_process>), final_answer,
 * cpa_sub_tasks, cfa_sub_tasks, tools_used, conflict_variance?, reasonability_checks.
 */
router.post('/lead-partner', async (req: Request, res: Response) => {
  try {
    const body = req.body as LeadPartnerInput & {
      balanceSheet?: unknown;
      profitAndLoss?: unknown;
    };
    const query = (body?.query ?? '').trim();
    if (!query) {
      res.status(400).json({ error: 'Missing "query" in body' });
      return;
    }
    const output = await runLeadPartner({
      query,
      rawRows: body.rawRows,
      entries: body.entries,
      bankStatementBalance: body.bankStatementBalance,
      periodLabel: body.periodLabel,
      balanceSheet: body.balanceSheet as LeadPartnerInput['balanceSheet'],
      profitAndLoss: body.profitAndLoss as LeadPartnerInput['profitAndLoss'],
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
