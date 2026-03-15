/**
 * Vector Store API — pgvector-backed semantic search for GAAP/IFRS/Tax standards.
 *
 * POST /api/vector-store/query    — Semantic search against knowledge embeddings
 * POST /api/vector-store/seed     — Seed Tier 1 with FASB ASC codification excerpts
 * GET  /api/vector-store/stats    — Count of chunks by framework/tier
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { getPool, isDbConfigured } from '../db/index.js';
import {
  queryVectorStore,
  countChunks,
  insertChunksBatch,
  deleteChunks,
} from '../knowledge_base/vector_store/pg_vector_store.js';
import { GAAP_SEED_CHUNKS } from '../knowledge_base/vector_store/gaap_seed_data.js';
import { log } from '../lib/logger.js';

const router = Router();

/**
 * POST /api/vector-store/query
 * Body: { query: string, topK?: number, framework?: string, tier?: string }
 */
router.post('/query', async (req: Request, res: Response) => {
  try {
    const { query, topK, framework, tier } = req.body as {
      query?: string;
      topK?: number;
      framework?: string;
      tier?: string;
    };
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'query is required' });
    }
    if (!isDbConfigured()) {
      return res.status(503).json({ error: 'Database not configured' });
    }

    const pool = getPool();
    const chunks = await queryVectorStore(pool, query, {
      topK: topK ?? 5,
      framework,
      tier,
    });

    return res.json({
      query,
      results: chunks.map((c) => ({
        id: c.id,
        citation: c.citation,
        section: c.section,
        framework: c.framework,
        chunkText: c.chunkText,
        similarity: c.similarity,
        metadata: c.metadata,
      })),
      count: chunks.length,
    });
  } catch (err) {
    log('error', 'Vector store query error', { error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ error: 'Vector store query failed' });
  }
});

/**
 * POST /api/vector-store/seed
 * Seeds Tier 1 with 100+ FASB/IFRS/Tax chunks. Idempotent: clears existing tier1 first.
 * Body: { force?: boolean } — set force=true to re-seed even if chunks exist
 */
router.post('/seed', async (req: Request, res: Response) => {
  try {
    if (!isDbConfigured()) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const pool = getPool();
    const { force } = (req.body ?? {}) as { force?: boolean };

    // Check if already seeded
    const existing = await countChunks(pool, { tier: 'tier1_global' });
    if (existing > 0 && !force) {
      return res.json({
        message: `Already seeded with ${existing} chunks. Send { "force": true } to re-seed.`,
        count: existing,
        seeded: false,
      });
    }

    // Clear existing tier1 chunks if re-seeding
    if (existing > 0) {
      const deleted = await deleteChunks(pool, { tier: 'tier1_global' });
      log('info', `Cleared ${deleted} existing tier1 chunks for re-seed`);
    }

    // Insert all seed chunks
    const inserted = await insertChunksBatch(pool, GAAP_SEED_CHUNKS);
    log('info', `Seeded ${inserted} GAAP/IFRS/Tax chunks into pgvector`);

    return res.json({
      message: `Seeded ${inserted} chunks successfully`,
      count: inserted,
      seeded: true,
      breakdown: {
        FASB: GAAP_SEED_CHUNKS.filter((c) => c.framework === 'FASB').length,
        IFRS: GAAP_SEED_CHUNKS.filter((c) => c.framework === 'IFRS').length,
        TAX: GAAP_SEED_CHUNKS.filter((c) => c.framework === 'TAX').length,
      },
    });
  } catch (err) {
    log('error', 'Vector store seed error', { error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ error: `Seed failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

/**
 * GET /api/vector-store/stats
 * Returns counts of chunks by framework and tier.
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    if (!isDbConfigured()) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const pool = getPool();

    const total = await countChunks(pool);
    const fasb = await countChunks(pool, { framework: 'FASB' });
    const ifrsCount = await countChunks(pool, { framework: 'IFRS' });
    const taxCount = await countChunks(pool, { framework: 'TAX' });
    const tier1 = await countChunks(pool, { tier: 'tier1_global' });

    return res.json({
      total,
      byFramework: { FASB: fasb, IFRS: ifrsCount, TAX: taxCount },
      byTier: { tier1_global: tier1, other: total - tier1 },
    });
  } catch (err) {
    log('error', 'Vector store stats error', { error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ error: 'Stats query failed' });
  }
});

export default router;
