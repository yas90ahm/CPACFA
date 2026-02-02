/**
 * Statutory API — agentic: suggest adjustments for management-to-statutory.
 */

import { Router, type Request, type Response } from 'express';
import { suggestStatutoryAdjustmentsAgentic } from '../services/agentic_statutory_reconciliation.js';

const router = Router();

/** POST /api/statutory/suggest-adjustments — Agentic: suggest management-to-statutory adjustments */
router.post('/suggest-adjustments', async (req: Request, res: Response) => {
  try {
    const body = req.body as { managementSummary?: string; jurisdiction?: string };
    if (typeof body?.managementSummary !== 'string') {
      res.status(400).json({ error: 'managementSummary required' });
      return;
    }
    const result = await suggestStatutoryAdjustmentsAgentic({
      managementSummary: body.managementSummary,
      jurisdiction: body.jurisdiction,
    });
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Suggest statutory adjustments failed', message });
  }
});

export default router;
