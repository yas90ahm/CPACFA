/**
 * Financial Memory API: three-tier storage and hybrid search.
 * CPA agent uses POST /api/knowledge-base/invoice-consistency to find how similar
 * invoices were treated for consistency of reporting.
 */

import { Router, type Request, type Response } from 'express';
import type { ChartOfAccountsLine } from '../knowledge_base/index.js';
import {
  getGlobalEntries,
  setChartOfAccounts,
  getChartOfAccounts,
  addHistoricalPolicy,
  getHistoricalPolicies,
  recordInvoiceTreatment,
  getInvoiceTreatments,
  addSessionUpload,
  getSessionUploads,
  clearSession,
  searchFinancialMemory,
  cpaInvoiceConsistencyLookup,
} from '../knowledge_base/index.js';
import { send500 } from '../lib/errorHandler.js';

const COA_TYPES: ChartOfAccountsLine['type'][] = ['asset', 'liability', 'equity', 'revenue', 'expense', 'other'];

const router = Router();

/** Tier 1 (Global): list entries (FASB, IFRS, Tax) — read-only. */
router.get('/tier1/entries', (_req: Request, res: Response) => {
  try {
    const entries = getGlobalEntries();
    res.json({ tier: 'global', entries });
  } catch (err) {
    send500(res, err, 'Tier1 list failed');
  }
});

/** Tier 2 (Firm): get Chart of Accounts. */
router.get('/tier2/chart-of-accounts', (_req: Request, res: Response) => {
  try {
    const lines = getChartOfAccounts();
    res.json({ tier: 'firm', chartOfAccounts: lines });
  } catch (err) {
    send500(res, err, 'CoA get failed');
  }
});

/** Tier 2 (Firm): set Chart of Accounts (bulk). */
router.post('/tier2/chart-of-accounts', (req: Request, res: Response) => {
  try {
    const body = req.body as {
      chartOfAccounts?: { code: string; name: string; type?: string; parentCode?: string; description?: string }[];
    };
    const raw = body?.chartOfAccounts ?? [];
    const lines: ChartOfAccountsLine[] = raw.map((l) => ({
      code: l.code,
      name: l.name,
      type: (COA_TYPES.includes(l.type as ChartOfAccountsLine['type']) ? l.type : 'other') as ChartOfAccountsLine['type'],
      parentCode: l.parentCode,
      description: l.description,
    }));
    setChartOfAccounts(lines);
    res.json({ tier: 'firm', message: 'Chart of Accounts updated', count: lines.length });
  } catch (err) {
    send500(res, err, 'CoA set failed');
  }
});

/** Tier 2 (Firm): add historical policy. */
router.post('/tier2/policies', (req: Request, res: Response) => {
  try {
    const body = req.body as { id?: string; topic: string; policy: string; citation?: string; effectiveFrom: string; effectiveTo?: string };
    const id = body?.id ?? `policy-${Date.now()}`;
    addHistoricalPolicy({
      id,
      topic: body.topic ?? '',
      policy: body.policy ?? '',
      citation: body.citation,
      effectiveFrom: body.effectiveFrom ?? new Date().toISOString().slice(0, 10),
      effectiveTo: body.effectiveTo,
    });
    res.json({ tier: 'firm', message: 'Policy added', id });
  } catch (err) {
    send500(res, err, 'Policy add failed');
  }
});

/** Tier 2 (Firm): list historical policies. */
router.get('/tier2/policies', (_req: Request, res: Response) => {
  try {
    const policies = getHistoricalPolicies();
    res.json({ tier: 'firm', policies });
  } catch (err) {
    send500(res, err, 'Policies get failed');
  }
});

/** Tier 2 (Firm): record invoice treatment (for consistency of reporting). */
router.post('/tier2/invoice-treatments', (req: Request, res: Response) => {
  try {
    const body = req.body as {
      vendor: string;
      description: string;
      amount: number;
      currency?: string;
      accountCode: string;
      accountCode2?: string;
      period: string;
      citation?: string;
      reasoning?: string;
    };
    const record = recordInvoiceTreatment({
      vendor: body.vendor ?? '',
      description: body.description ?? '',
      amount: body.amount ?? 0,
      currency: body.currency ?? 'USD',
      accountCode: body.accountCode ?? '',
      accountCode2: body.accountCode2,
      period: body.period ?? '',
      citation: body.citation,
      reasoning: body.reasoning,
    });
    res.json({ tier: 'firm', message: 'Invoice treatment recorded', treatment: record });
  } catch (err) {
    send500(res, err, 'Invoice treatment record failed');
  }
});

/** Tier 2 (Firm): list invoice treatments. */
router.get('/tier2/invoice-treatments', (_req: Request, res: Response) => {
  try {
    const treatments = getInvoiceTreatments();
    res.json({ tier: 'firm', treatments });
  } catch (err) {
    send500(res, err, 'Treatments get failed');
  }
});

/** Tier 3 (Session): add uploaded file/content. */
router.post('/tier3/upload', (req: Request, res: Response) => {
  try {
    const body = req.body as { sessionId: string; filename: string; contentType?: string; summaryText: string; metadata?: Record<string, unknown> };
    const sessionId = body?.sessionId ?? 'default';
    const upload = addSessionUpload(sessionId, {
      filename: body.filename ?? 'unknown',
      contentType: body.contentType,
      summaryText: body.summaryText ?? '',
      metadata: body.metadata,
    });
    res.json({ tier: 'session', message: 'Upload recorded', upload });
  } catch (err) {
    send500(res, err, 'Session upload failed');
  }
});

/** Tier 3 (Session): list uploads. */
router.get('/tier3/uploads', (req: Request, res: Response) => {
  try {
    const sessionId = (req.query.sessionId as string) ?? 'default';
    const uploads = getSessionUploads(sessionId);
    res.json({ tier: 'session', sessionId, uploads });
  } catch (err) {
    send500(res, err, 'Session uploads get failed');
  }
});

/** Tier 3 (Session): clear session. */
router.delete('/tier3/session/:sessionId', (req: Request, res: Response) => {
  try {
    const sessionId = req.params.sessionId ?? 'default';
    clearSession(sessionId);
    res.json({ tier: 'session', message: 'Session cleared', sessionId });
  } catch (err) {
    send500(res, err, 'Session clear failed');
  }
});

/** Hybrid search across tiers. */
router.post('/search', (req: Request, res: Response) => {
  try {
    const body = req.body as { query: string; tiers?: string[]; topK?: number; sessionId?: string };
    const query = (body?.query ?? '').trim();
    if (!query) {
      res.status(400).json({ error: 'Missing "query" in body' });
      return;
    }
    const tiers = body.tiers as ('global' | 'firm' | 'session')[] | undefined;
    const results = searchFinancialMemory(query, {
      tiers,
      topK: body.topK ?? 20,
      sessionId: body.sessionId,
    });
    res.json({ query, results });
  } catch (err) {
    send500(res, err, 'Search failed');
  }
});

/**
 * CPA invoice consistency: find how similar invoices were treated in previous years.
 * Use when analyzing an invoice to ensure consistency of reporting.
 */
router.post('/invoice-consistency', (req: Request, res: Response) => {
  try {
    const body = req.body as {
      invoiceDescription: string;
      vendor?: string;
      accountCode?: string;
      sessionId?: string;
      topK?: number;
    };
    const invoiceDescription = (body?.invoiceDescription ?? '').trim();
    if (!invoiceDescription) {
      res.status(400).json({ error: 'Missing "invoiceDescription" in body' });
      return;
    }
    const result = cpaInvoiceConsistencyLookup({
      invoiceDescription,
      vendor: body.vendor,
      accountCode: body.accountCode,
      sessionId: body.sessionId,
      topK: body.topK ?? 10,
    });
    res.json(result);
  } catch (err) {
    send500(res, err, 'Invoice consistency lookup failed');
  }
});

export default router;
