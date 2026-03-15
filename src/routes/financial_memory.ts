/**
 * Financial Memory (Knowledge Base) API — Three-tier hierarchy and hybrid search.
 * Tier 1: Global (FASB, IFRS, Tax). Tier 2: Firm (CoA, policies, invoice treatments). Tier 3: Session (uploaded files).
 * POST /search — Hybrid search across tiers
 * GET /tier1/entries — All Tier 1 (Global) entries
 * GET /tier2/coa — Chart of Accounts
 * GET /tier2/policies — Historical policies
 * GET /tier2/treatments — Invoice treatments
 * POST /tier2/coa — Set Chart of Accounts
 * POST /tier2/policy — Add historical policy
 * POST /tier2/treatment — Record invoice treatment
 * POST /tier3/upload — Add session upload
 * GET /tier3/uploads/:sessionId — Get session uploads
 * POST /invoice-consistency — CPA invoice consistency lookup
 */

import { Router, type Request, type Response } from 'express';
import {
  getGlobalEntries,
  queryGlobal,
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

const router = Router();

// --- Hybrid Search ---

/** POST /api/knowledge-base/search — Hybrid search across tiers. */
router.post('/search', (req: Request, res: Response) => {
  try {
    const body = req.body as {
      query: string;
      tiers?: ('global' | 'firm' | 'session')[];
      topK?: number;
      sessionId?: string;
    };
    if (!body.query) {
      return res.status(400).json({ error: 'Missing query' });
    }
    const results = searchFinancialMemory(body.query, {
      tiers: body.tiers,
      topK: body.topK ?? 20,
      sessionId: body.sessionId,
    });
    return res.json({ query: body.query, count: results.length, results });
  } catch (err) {
    send500(res, err, 'Knowledge base search failed');
    return;
  }
});

// --- Tier 1 (Global) ---

/** GET /api/knowledge-base/tier1/entries — All Tier 1 (Global) entries. */
router.get('/tier1/entries', (_req: Request, res: Response) => {
  try {
    const entries = getGlobalEntries();
    return res.json({ tier: 'global', count: entries.length, entries });
  } catch (err) {
    send500(res, err, 'Get global entries failed');
    return;
  }
});

/** POST /api/knowledge-base/tier1/query — Query Tier 1 (FASB/IFRS/Tax). */
router.post('/tier1/query', async (req: Request, res: Response) => {
  try {
    const body = req.body as { query: string; topK?: number; framework?: 'FASB' | 'IFRS' | 'Tax' };
    if (!body.query) {
      return res.status(400).json({ error: 'Missing query' });
    }
    const entries = await queryGlobal(body.query, {
      topK: body.topK ?? 10,
      framework: body.framework,
    });
    return res.json({ query: body.query, count: entries.length, entries });
  } catch (err) {
    send500(res, err, 'Tier 1 query failed');
    return;
  }
});

// --- Tier 2 (Firm) ---

/** GET /api/knowledge-base/tier2/coa — Chart of Accounts. */
router.get('/tier2/coa', (_req: Request, res: Response) => {
  try {
    const lines = getChartOfAccounts();
    return res.json({ count: lines.length, lines });
  } catch (err) {
    send500(res, err, 'Get CoA failed');
    return;
  }
});

/** POST /api/knowledge-base/tier2/coa — Set (replace) Chart of Accounts. */
router.post('/tier2/coa', (req: Request, res: Response) => {
  try {
    const body = req.body as { lines: Array<{ code: string; name: string; type: string; parentCode?: string; description?: string }> };
    if (!body.lines || !Array.isArray(body.lines)) {
      return res.status(400).json({ error: 'Missing lines array' });
    }
    setChartOfAccounts(body.lines as Parameters<typeof setChartOfAccounts>[0]);
    return res.json({ ok: true, count: body.lines.length });
  } catch (err) {
    send500(res, err, 'Set CoA failed');
    return;
  }
});

/** GET /api/knowledge-base/tier2/policies — Historical policies. */
router.get('/tier2/policies', (_req: Request, res: Response) => {
  try {
    const policies = getHistoricalPolicies();
    return res.json({ count: policies.length, policies });
  } catch (err) {
    send500(res, err, 'Get policies failed');
    return;
  }
});

/** POST /api/knowledge-base/tier2/policy — Add historical policy. */
router.post('/tier2/policy', (req: Request, res: Response) => {
  try {
    const body = req.body as { id: string; topic: string; policy: string; citation?: string; effectiveFrom: string; effectiveTo?: string };
    if (!body.id || !body.topic || !body.policy || !body.effectiveFrom) {
      return res.status(400).json({ error: 'Missing required fields: id, topic, policy, effectiveFrom' });
    }
    addHistoricalPolicy(body);
    return res.json({ ok: true, id: body.id });
  } catch (err) {
    send500(res, err, 'Add policy failed');
    return;
  }
});

/** GET /api/knowledge-base/tier2/treatments — Invoice treatments. */
router.get('/tier2/treatments', (_req: Request, res: Response) => {
  try {
    const treatments = getInvoiceTreatments();
    return res.json({ count: treatments.length, treatments });
  } catch (err) {
    send500(res, err, 'Get treatments failed');
    return;
  }
});

/** POST /api/knowledge-base/tier2/treatment — Record invoice treatment. */
router.post('/tier2/treatment', (req: Request, res: Response) => {
  try {
    const body = req.body as {
      vendor: string; description: string; amount: number; currency: string;
      accountCode: string; accountCode2?: string; period: string; citation?: string; reasoning?: string;
    };
    if (!body.vendor || !body.description || body.amount == null || !body.currency || !body.accountCode || !body.period) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const record = recordInvoiceTreatment(body);
    return res.json({ ok: true, id: record.id, storedAt: record.storedAt });
  } catch (err) {
    send500(res, err, 'Record treatment failed');
    return;
  }
});

// --- Tier 3 (Session) ---

/** POST /api/knowledge-base/tier3/upload — Add session upload. */
router.post('/tier3/upload', (req: Request, res: Response) => {
  try {
    const body = req.body as { sessionId: string; filename: string; contentType?: string; summaryText: string; metadata?: Record<string, unknown> };
    if (!body.sessionId || !body.filename || !body.summaryText) {
      return res.status(400).json({ error: 'Missing sessionId, filename, or summaryText' });
    }
    const upload = addSessionUpload(body.sessionId, {
      filename: body.filename,
      contentType: body.contentType,
      summaryText: body.summaryText,
      metadata: body.metadata,
    });
    return res.json({ ok: true, id: upload.id, uploadedAt: upload.uploadedAt });
  } catch (err) {
    send500(res, err, 'Add session upload failed');
    return;
  }
});

/** GET /api/knowledge-base/tier3/uploads/:sessionId — Get session uploads. */
router.get('/tier3/uploads/:sessionId', (req: Request, res: Response) => {
  try {
    const uploads = getSessionUploads(req.params.sessionId);
    return res.json({ sessionId: req.params.sessionId, count: uploads.length, uploads });
  } catch (err) {
    send500(res, err, 'Get session uploads failed');
    return;
  }
});

/** DELETE /api/knowledge-base/tier3/session/:sessionId — Clear session data. */
router.delete('/tier3/session/:sessionId', (req: Request, res: Response) => {
  try {
    clearSession(req.params.sessionId);
    return res.json({ ok: true });
  } catch (err) {
    send500(res, err, 'Clear session failed');
    return;
  }
});

// --- CPA Invoice Consistency ---

/** POST /api/knowledge-base/invoice-consistency — Find similar past treatments for consistency of reporting. */
router.post('/invoice-consistency', (req: Request, res: Response) => {
  try {
    const body = req.body as { invoiceDescription: string; vendor?: string; accountCode?: string; sessionId?: string; topK?: number };
    if (!body.invoiceDescription) {
      return res.status(400).json({ error: 'Missing invoiceDescription' });
    }
    const result = cpaInvoiceConsistencyLookup({
      invoiceDescription: body.invoiceDescription,
      vendor: body.vendor,
      accountCode: body.accountCode,
      sessionId: body.sessionId,
      topK: body.topK,
    });
    return res.json(result);
  } catch (err) {
    send500(res, err, 'Invoice consistency lookup failed');
    return;
  }
});

export default router;
