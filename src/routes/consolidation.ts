/**
 * Consolidation API — agentic: suggest eliminations, generate footnote.
 */

import { Router, type Request, type Response } from 'express';
import {
  suggestEliminationRulesAgentic,
  generateConsolidationFootnoteAgentic,
} from '../services/agentic_consolidation.js';

const router = Router();

/** POST /api/consolidation/suggest-eliminations — Agentic: suggest elimination rules */
router.post('/suggest-eliminations', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      entityTBs?: { entityId: string; accountNames: string[] }[];
      relationshipDescription?: string;
    };
    if (!Array.isArray(body?.entityTBs)) {
      res.status(400).json({ error: 'entityTBs array required' });
      return;
    }
    const result = await suggestEliminationRulesAgentic({
      entityTBs: body.entityTBs,
      relationshipDescription: body.relationshipDescription,
    });
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Suggest eliminations failed', message });
  }
});

/** POST /api/consolidation/footnote — Agentic: generate consolidation footnote */
router.post('/footnote', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      periodLabel?: string;
      reportingCurrency: string;
      entityCount: number;
      eliminationCount: number;
      nciShareOfEquity?: number;
      nciShareOfNetIncome?: number;
    };
    if (typeof body?.reportingCurrency !== 'string' || typeof body?.entityCount !== 'number') {
      res.status(400).json({ error: 'reportingCurrency and entityCount required' });
      return;
    }
    const result = await generateConsolidationFootnoteAgentic({
      periodLabel: body.periodLabel,
      reportingCurrency: body.reportingCurrency,
      entityCount: body.entityCount,
      eliminationCount: body.eliminationCount ?? 0,
      nciShareOfEquity: body.nciShareOfEquity,
      nciShareOfNetIncome: body.nciShareOfNetIncome,
    });
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Generate consolidation footnote failed', message });
  }
});

export default router;
