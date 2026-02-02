/**
 * AR/AP workflows: collections (agentic), payment run (agentic), cash application (agentic).
 */

import { Router, Request, Response } from 'express';
import { buildArAgingReport, buildApAgingReport } from '../services/ap_ar_aging_service.js';
import {
  recommendCollectionsAgentic,
  recommendPaymentRunAgentic,
  suggestCashApplicationAgentic,
} from '../services/agentic_ar_ap_workflows.js';
import type { CanonicalArItem, CanonicalApItem } from '../types/canonical_ap_ar_payroll.js';

const router = Router();

router.post('/collections/recommend', async (req: Request, res: Response) => {
  try {
    const { arItems, asOfDate, limit } = req.body ?? {};
    if (!Array.isArray(arItems)) return res.status(400).json({ error: 'arItems array required' });
    const arAging = buildArAgingReport(arItems as CanonicalArItem[], { asOfDate });
    const recommendations = await recommendCollectionsAgentic(arAging, { limit });
    res.json({ arAging, recommendations });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post('/payment-run/recommend', async (req: Request, res: Response) => {
  try {
    const { apItems, asOfDate, maxTotal, limit } = req.body ?? {};
    if (!Array.isArray(apItems)) return res.status(400).json({ error: 'apItems array required' });
    const apAging = buildApAgingReport(apItems as CanonicalApItem[], { asOfDate });
    const recommendations = await recommendPaymentRunAgentic(apAging, { maxTotal, limit });
    res.json({ apAging, recommendations });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post('/cash-application/suggest', async (req: Request, res: Response) => {
  try {
    const { payment, openAr } = req.body ?? {};
    if (!payment?.id || payment?.amount == null || !payment?.date) {
      return res.status(400).json({ error: 'payment { id, amount, date } required' });
    }
    const openArList = Array.isArray(openAr) ? (openAr as CanonicalArItem[]) : [];
    const match = await suggestCashApplicationAgentic(payment, openArList);
    res.json(match);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
