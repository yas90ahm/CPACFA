/**
 * Close JE/accruals routes: accrual-suggestions, inventory-valuation, je-suggestions, je-suggestions/from-text, je-suggestions/explain.
 */

import { Router, type Request, type Response } from 'express';
import { buildJournalEntrySuggestions } from '../../services/month_end_close_service.js';
// QUARANTINED — Agentic accrual suggestions not in MVP architecture
// import { buildAccrualSuggestions, suggestAccrualsAgentic } from '../../services/accrual_deferral_service.js';
// import { computeInventoryValuation } from '../../services/inventory_valuation_service.js';
import { accrualSuggestionsSchema, inventoryValuationSchema, jeSuggestionsSchema } from '../../schemas/closeSchemas.js';
import { validateBody } from '../../middleware/validateRequest.js';
import { send500 } from '../../lib/errorHandler.js';

const router = Router();

// QUARANTINED — Agentic accrual suggestions not in MVP architecture
// /** POST /api/close/accrual-suggestions */
// router.post('/accrual-suggestions', validateBody(accrualSuggestionsSchema), (req: Request, res: Response) => {
//   try {
//     const body = req.body;
//     const suggestions = buildAccrualSuggestions(body);
//     res.json({ suggestions });
//   } catch (e) {
//     send500(res, e, 'Accrual suggestions failed');
//   }
// });

// /** POST /api/close/accrual-suggestions/agentic */
// router.post('/accrual-suggestions/agentic', validateBody(accrualSuggestionsSchema), async (req: Request, res: Response) => {
//   try {
//     const body = req.body;
//     const suggestions = await suggestAccrualsAgentic(body);
//     res.json({ suggestions });
//   } catch (e) {
//     send500(res, e, 'Agentic accrual suggestions failed');
//   }
// });

// /** POST /api/close/inventory-valuation */
// router.post('/inventory-valuation', validateBody(inventoryValuationSchema), (req: Request, res: Response) => {
//   try {
//     const body = req.body;
//     const result = computeInventoryValuation(body);
//     res.json(result);
//   } catch (e) {
//     send500(res, e, 'Inventory valuation failed');
//   }
// });

/** POST /api/close/je-suggestions */
router.post('/je-suggestions', validateBody(jeSuggestionsSchema), (req: Request, res: Response) => {
  try {
    const body = req.body;
    const gaps = body.gaps ?? [];
    const mismatches = body.mismatches ?? [];
    const suggestions = buildJournalEntrySuggestions(gaps, mismatches);
    res.json({ suggestions });
  } catch (e) {
    send500(res, e, 'JE suggestions failed');
  }
});

/** POST /api/close/je-suggestions/from-text — Quarantined (AI amounts out of scope). */
router.post('/je-suggestions/from-text', (_req: Request, res: Response) => {
  res.status(410).json({
    error: 'Out of scope',
    message: 'Agentic JE suggestions from text are quarantined. Use deterministic je-suggestions or HITL staging.',
  });
});

/** POST /api/close/je-suggestions/explain — Quarantined (agentic narrative). */
router.post('/je-suggestions/explain', (_req: Request, res: Response) => {
  res.status(410).json({
    error: 'Out of scope',
    message: 'Agentic JE explain is quarantined. Use justification service for IRAC memos.',
  });
});

export default router;
