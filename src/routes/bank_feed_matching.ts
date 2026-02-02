/**
 * Bank feed + auto-match to GL/AR (agentic).
 */

import { Router, Request, Response } from 'express';
import { suggestBankFeedMatchesAgentic } from '../services/agentic_bank_feed_matching.js';
import type { CanonicalBankTransaction } from '../types/canonical_ap_ar_payroll.js';
import type { GLCashEntry } from '../services/bank_reconciliation_service.js';
import type { CanonicalArItem } from '../types/canonical_ap_ar_payroll.js';

const router = Router();

router.post('/suggest-matches', async (req: Request, res: Response) => {
  try {
    const { bankTransactions, glCashEntries, openAr } = req.body ?? {};
    if (!Array.isArray(bankTransactions) || !Array.isArray(glCashEntries)) {
      return res.status(400).json({ error: 'bankTransactions and glCashEntries arrays required' });
    }
    const bankTx = bankTransactions as (CanonicalBankTransaction & { id: string })[];
    const glEntries = glCashEntries as GLCashEntry[];
    const ar = Array.isArray(openAr) ? (openAr as CanonicalArItem[]) : [];
    const suggestions = await suggestBankFeedMatchesAgentic(bankTx, glEntries, ar);
    res.json({ suggestions });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
