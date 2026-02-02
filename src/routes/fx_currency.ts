/**
 * FX currency API — translation (current-rate, CTA), remeasurement (temporal), agentic (ASC 830 / IAS 21).
 */

import { Router, type Request, type Response } from 'express';
import {
  translateToReportingCurrency,
  remeasureToFunctionalCurrency,
} from '../services/fx_currency_service.js';
import {
  suggestFunctionalCurrencyAgentic,
  generateFxFootnoteAgentic,
} from '../services/agentic_fx_currency.js';
import { validateBody } from '../middleware/validateRequest.js';
import {
  translateSchema,
  remeasureSchema,
  suggestFunctionalCurrencySchema,
  generateFxFootnoteSchema,
} from '../schemas/fxCurrencySchemas.js';

const router = Router();

/** POST /api/fx/translate — Current-rate translation to reporting currency (CTA) */
router.post(
  '/translate',
  validateBody(translateSchema),
  async (req: Request, res: Response) => {
    try {
      const { lines, reportingCurrency, fxRates, method } = req.body;
      const result = translateToReportingCurrency(
        lines,
        reportingCurrency,
        fxRates,
        method ?? 'current_rate'
      );
      res.json(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: 'Translate failed', message });
    }
  }
);

/** POST /api/fx/remeasure — Temporal remeasurement to functional currency */
router.post(
  '/remeasure',
  validateBody(remeasureSchema),
  async (req: Request, res: Response) => {
    try {
      const { lines, functionalCurrency, fxRates } = req.body;
      const result = remeasureToFunctionalCurrency(
        lines,
        functionalCurrency,
        fxRates
      );
      res.json(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: 'Remeasure failed', message });
    }
  }
);

/** POST /api/fx/suggest-functional-currency — Agentic: suggest functional currency */
router.post(
  '/suggest-functional-currency',
  validateBody(suggestFunctionalCurrencySchema),
  async (req: Request, res: Response) => {
    try {
      const result = await suggestFunctionalCurrencyAgentic(req.body);
      res.json(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: 'Suggest functional currency failed', message });
    }
  }
);

/** POST /api/fx/footnote — Agentic: generate FX footnote */
router.post(
  '/footnote',
  validateBody(generateFxFootnoteSchema),
  async (req: Request, res: Response) => {
    try {
      const body = req.body as { accountingStandard?: 'ASPE' | 'IFRS' | 'FRS102' | 'US_GAAP'; reportingCurrency: string; translationSummary?: string; cta?: number; remeasurementGainLoss?: number; functionalCurrency?: string };
      const topicStandard = body.accountingStandard ? getFxTopicStandard(body.accountingStandard) : undefined;
      const { accountingStandard: _ac, ...rest } = body;
      const result = await generateFxFootnoteAgentic({ ...rest, ...(topicStandard != null ? { topicStandard } : {}) });
      res.json(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: 'Generate FX footnote failed', message });
    }
  }
);

export default router;
