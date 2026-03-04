/**
 * Consolidation routes — stateless multi-entity consolidation.
 * Mounted at /api/consolidation in server.ts.
 */

import { Router, type Request, type Response } from 'express';
import { send500 } from '../lib/errorHandler.js';
import { buildConsolidation } from '../services/consolidation_service.js';

const router = Router();

/** POST /api/consolidation/build — Build consolidated trial balance from entity balances and elimination rules. */
router.post('/build', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (!Array.isArray(body.entities) || !Array.isArray(body.entityBalances) || !Array.isArray(body.eliminationRules) || !body.reportingCurrency || !body.periodLabel) {
      res.status(400).json({ error: 'entities[], entityBalances[], eliminationRules[], reportingCurrency, and periodLabel are required' });
      return;
    }
    const result = buildConsolidation(body);
    res.json({ result });
  } catch (e) {
    send500(res, e, 'Build consolidation failed');
  }
});

export default router;
