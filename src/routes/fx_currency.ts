/**
 * FX currency translation routes — stateless translation and remeasurement.
 * Mounted at /api/fx in server.ts.
 */

import { Router, type Request, type Response } from 'express';
import { send500 } from '../lib/errorHandler.js';
import {
  translateToReportingCurrency,
  remeasureToFunctionalCurrency,
} from '../services/fx_currency_service.js';

const router = Router();

/** POST /api/fx/translate — Translate balance lines to reporting currency (current-rate method). */
router.post('/translate', async (req: Request, res: Response) => {
  try {
    const { lines, reportingCurrency, fxRates, method } = req.body;
    if (!Array.isArray(lines) || !reportingCurrency || !fxRates) {
      res.status(400).json({ error: 'lines[], reportingCurrency, and fxRates are required' });
      return;
    }
    const result = translateToReportingCurrency(lines, reportingCurrency, fxRates, method);
    res.json({ result });
  } catch (e) {
    send500(res, e, 'FX translation failed');
  }
});

/** POST /api/fx/remeasure — Remeasure balance lines to functional currency (temporal method). */
router.post('/remeasure', async (req: Request, res: Response) => {
  try {
    const { lines, functionalCurrency, fxRates } = req.body;
    if (!Array.isArray(lines) || !functionalCurrency || !fxRates) {
      res.status(400).json({ error: 'lines[], functionalCurrency, and fxRates are required' });
      return;
    }
    const result = remeasureToFunctionalCurrency(lines, functionalCurrency, fxRates);
    res.json({ result });
  } catch (e) {
    send500(res, e, 'FX remeasurement failed');
  }
});

export default router;
