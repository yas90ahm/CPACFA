/**
 * Semantic Memory API — Storage, retrieval, and consistency checks.
 * When a new file is uploaded, the agent can query: "Have I seen this vendor before? How did we categorize it last time?"
 * If agent logic contradicts a previous user correction, the agent should pause and ask using the returned promptForUser.
 */

import { Router, type Request, type Response } from 'express';
import {
  storeUserCorrection,
  storeJustification,
  storeDecision,
  queryMemory,
  lookupVendor,
  checkConsistency,
  getById,
  listAll,
  setTransactionCategory,
  updatePolicyMemory,
} from '../memory/index.js';
import { send500 } from '../lib/errorHandler.js';

const router = Router();

/** POST /api/memory/correction — Store a user correction (e.g. vendor -> category). */
router.post('/correction', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      vendor: string;
      category: string;
      accountCode?: string;
      accountName?: string;
      period?: string;
      citation?: string;
      note?: string;
    };
    if (!body.vendor || !body.category) {
      return res.status(400).json({ error: 'Missing vendor or category' });
    }
    const entry = await storeUserCorrection(body);
    return res.json({ ok: true, id: entry.id, storedAt: entry.storedAt });
  } catch (err) {
    send500(res, err, 'Store correction failed');
    return;
  }
});

/** POST /api/memory/justification — Store a justification. */
router.post('/justification', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      questionOrTopic: string;
      conclusion: string;
      citation?: string;
      accountCode?: string;
    };
    if (!body.questionOrTopic || !body.conclusion) {
      return res.status(400).json({ error: 'Missing questionOrTopic or conclusion' });
    }
    const entry = await storeJustification(body);
    return res.json({ ok: true, id: entry.id, storedAt: entry.storedAt });
  } catch (err) {
    send500(res, err, 'Store justification failed');
    return;
  }
});

/** POST /api/memory/decision — Store a major decision. */
router.post('/decision', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      context: string;
      choice: string;
      reason?: string;
      accountCode?: string;
      period?: string;
    };
    if (!body.context || !body.choice) {
      return res.status(400).json({ error: 'Missing context or choice' });
    }
    const entry = await storeDecision(body);
    return res.json({ ok: true, id: entry.id, storedAt: entry.storedAt });
  } catch (err) {
    send500(res, err, 'Store decision failed');
    return;
  }
});

/** POST /api/memory/transaction-category — Store a cash flow category override for a transaction. */
router.post('/transaction-category', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      entityId: string;
      description: string;
      category: 'operating' | 'investing' | 'financing';
    };
    if (!body.entityId || !body.description || !body.category) {
      return res.status(400).json({ error: 'Missing entityId, description, or category' });
    }
    await setTransactionCategory(body.entityId, body.description, body.category);
    return res.json({ ok: true });
  } catch (err) {
    send500(res, err, 'Store transaction category failed');
    return;
  }
});

/** POST /api/memory/query — Query semantic memory by text. */
router.post('/query', async (req: Request, res: Response) => {
  try {
    const body = req.body as { query: string; topK?: number; entryTypes?: string[]; minScore?: number };
    if (!body.query) {
      return res.status(400).json({ error: 'Missing query' });
    }
    const hits = await queryMemory(body.query, {
      topK: body.topK ?? 10,
      entryTypes: body.entryTypes as ('decision' | 'user_correction' | 'justification')[] | undefined,
      minScore: body.minScore,
    });
    return res.json({
      query: body.query,
      hits: hits.map((h) => ({ id: h.entry.id, score: h.score, entryType: h.entry.entryType, text: h.entry.text, payload: h.entry.payload, storedAt: h.entry.storedAt })),
    });
  } catch (err) {
    send500(res, err, 'Memory query failed');
    return;
  }
});

/** GET /api/memory/vendor/:vendor — Lookup vendor: "Have I seen this vendor before? How did we categorize it last time?" */
router.get('/vendor/:vendor', async (req: Request, res: Response) => {
  try {
    const vendor = decodeURIComponent(req.params.vendor);
    const topK = req.query.topK ? Number(req.query.topK) : 10;
    const hits = await lookupVendor(vendor, { topK });
    return res.json({
      vendor,
      hits: hits.map((h) => ({
        id: h.entry.id,
        score: h.score,
        entryType: h.entry.entryType,
        text: h.entry.text,
        payload: h.entry.payload,
        storedAt: h.entry.storedAt,
      })),
    });
  } catch (err) {
    send500(res, err, 'Vendor lookup failed');
    return;
  }
});

/** POST /api/memory/consistency-check — Check if agent's proposed category contradicts a previous user correction. */
router.post('/consistency-check', (req: Request, res: Response) => {
  try {
    const body = req.body as { vendor: string; currentCategory: string; period?: string };
    if (!body.vendor || !body.currentCategory) {
      return res.status(400).json({ error: 'Missing vendor or currentCategory' });
    }
    const result = checkConsistency(body.vendor, body.currentCategory, { period: body.period });
    return res.json(result);
  } catch (err) {
    send500(res, err, 'Consistency check failed');
    return;
  }
});

/** POST /api/memory/entity — Confirm or update entity-level policy (e.g. accounting standard). Agentic: user confirms low-confidence inference. */
router.post('/entity', (req: Request, res: Response) => {
  try {
    const body = req.body as {
      entityId: string;
      standard?: 'ASPE' | 'IFRS' | 'FRS102' | 'US_GAAP';
      country?: string;
      jurisdiction?: string;
      currency?: string;
      taxId?: string;
      businessNumber?: string;
      fiscalYear?: string;
    };
    if (!body.entityId) {
      return res.status(400).json({ error: 'Missing entityId' });
    }
    updatePolicyMemory(body.entityId, {
      standard: body.standard,
      country: body.country,
      jurisdiction: body.jurisdiction,
      currency: body.currency,
      taxId: body.taxId,
      businessNumber: body.businessNumber,
    }, body.fiscalYear);
    return res.json({ ok: true });
  } catch (err) {
    send500(res, err, 'Update entity policy failed');
    return;
  }
});

/** GET /api/memory/entry/:id — Get entry by id. */
router.get('/entry/:id', (req: Request, res: Response) => {
  const entry = getById(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Not found' });
  return res.json(entry);
});

/** GET /api/memory/list — List all entries (e.g. admin). */
router.get('/list', (_req: Request, res: Response) => {
  const entries = listAll();
  return res.json({ count: entries.length, entries });
});

export default router;
