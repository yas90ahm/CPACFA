/**
 * XBRL Taxonomy API: search, stats, element lookup, classify.
 * Mounted at /api/xbrl.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantPool } from '../lib/tenant_context.js';
import { send500 } from '../lib/errorHandler.js';
import { searchXBRL, getXBRLStats, getXBRLElement } from '../services/xbrl_search_service.js';
import { buildXBRLContext } from '../ai/prompts/xbrl_context.js';

const router = Router();

/**
 * GET /api/xbrl/search?q=cash&statement=BS&balance=debit&limit=10
 * Search XBRL taxonomy elements by text query.
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const q = String(req.query.q ?? '').trim();
    if (!q) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const statement = req.query.statement ? String(req.query.statement) : undefined;
    const balance = req.query.balance as 'debit' | 'credit' | undefined;
    const limit = req.query.limit ? Math.min(Number(req.query.limit), 50) : 10;

    const results = await searchXBRL(pool, q, {
      statement,
      balanceDirection: balance,
      limit,
    });

    res.json({ results, count: results.length });
  } catch (err) {
    send500(res, err, 'XBRL search failed');
  }
});

/**
 * GET /api/xbrl/stats
 * Get aggregate statistics about the XBRL taxonomy.
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const stats = await getXBRLStats(pool);
    res.json(stats);
  } catch (err) {
    send500(res, err, 'XBRL stats failed');
  }
});

/**
 * GET /api/xbrl/element/:id
 * Look up a single XBRL element by ID (e.g. us-gaap:CashAndCashEquivalentsAtCarryingValue).
 */
router.get('/element/:id', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const elementId = req.params.id;
    const element = await getXBRLElement(pool, elementId);
    if (!element) {
      return res.status(404).json({ error: 'XBRL element not found' });
    }

    res.json(element);
  } catch (err) {
    send500(res, err, 'XBRL element lookup failed');
  }
});

/**
 * POST /api/xbrl/classify
 * Given an account name + optional type/balance, return best XBRL matches
 * with formatted context for AI classifier.
 */
router.post('/classify', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const { accountName, accountType, balanceDirection, statement, limit } = req.body as {
      accountName?: string;
      accountType?: string;
      balanceDirection?: 'debit' | 'credit';
      statement?: string;
      limit?: number;
    };

    if (!accountName) {
      return res.status(400).json({ error: 'accountName is required' });
    }

    const results = await searchXBRL(pool, accountName, {
      accountType,
      balanceDirection,
      statement,
      limit: limit ?? 5,
    });

    const context = buildXBRLContext(results);

    res.json({
      results,
      count: results.length,
      context,
      bestMatch: results[0] ?? null,
    });
  } catch (err) {
    send500(res, err, 'XBRL classify failed');
  }
});

export default router;
