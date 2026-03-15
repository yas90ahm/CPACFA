/**
 * Financial Memory — Tier 1 (Global): FASB, IFRS, and Tax Codes.
 * Primary: pgvector semantic search (when DB available).
 * Fallback: in-memory keyword scoring for Tax chunks + no-DB environments.
 */

import type { MemoryEntry } from '../types.js';
import { isDbConfigured, getPool } from '../../db/index.js';
import { queryVectorStore, type VectorChunk } from '../vector_store/pg_vector_store.js';
import { log } from '../../lib/logger.js';

/** Tax code sample chunks (expand with real IRC/regulations in production). */
const TAX_CHUNKS: MemoryEntry[] = [
  {
    id: 'tax-irc-162',
    tier: 'global',
    source: 'Tax',
    text: 'IRC §162(a): Ordinary and necessary business expenses paid or incurred during the taxable year in carrying on any trade or business are deductible.',
    payload: { citation: 'IRC §162(a)', topic: 'Business expenses' },
    storedAt: new Date().toISOString(),
  },
  {
    id: 'tax-irc-263',
    tier: 'global',
    source: 'Tax',
    text: 'IRC §263(a): No deduction shall be allowed for capital expenditures. Amounts paid for new buildings or permanent improvements are capitalizable.',
    payload: { citation: 'IRC §263(a)', topic: 'Capitalization' },
    storedAt: new Date().toISOString(),
  },
  {
    id: 'tax-irc-461',
    tier: 'global',
    source: 'Tax',
    text: 'IRC §461: General rule for taxable year of deduction. An accrual basis taxpayer deducts an expense when all events have occurred that establish the fact of liability and the amount can be determined with reasonable accuracy.',
    payload: { citation: 'IRC §461', topic: 'Accrual' },
    storedAt: new Date().toISOString(),
  },
];

/** Convert RAG handbook chunks to MemoryEntry (FASB/IFRS). Called once and cached. */
function handbookToMemoryEntries(): MemoryEntry[] {
  // QUARANTINED — rag_handbook not in MVP architecture
  // const chunks = getHandbookChunks();
  // return chunks.map((c) => ({
  //   id: c.id,
  //   tier: 'global' as const,
  //   source: c.framework,
  //   text: [c.citation, c.section, c.text].filter(Boolean).join(' — '),
  //   payload: { citation: c.citation, section: c.section },
  //   storedAt: new Date().toISOString(),
  // }));
  return []; // No handbook chunks in MVP
}

let cachedGlobal: MemoryEntry[] | null = null;

/** All Tier 1 (Global) entries: FASB, IFRS, Tax. */
export function getGlobalEntries(): MemoryEntry[] {
  if (!cachedGlobal) {
    cachedGlobal = [...handbookToMemoryEntries(), ...TAX_CHUNKS];
  }
  return cachedGlobal;
}

type GlobalFramework = 'FASB' | 'IFRS' | 'Tax';

/** Convert a pgvector VectorChunk to a MemoryEntry for uniform consumption. */
function chunkToMemoryEntry(c: VectorChunk): MemoryEntry {
  return {
    id: c.id,
    tier: 'global',
    source: c.framework ?? 'FASB',
    text: [c.citation, c.section, c.chunkText].filter(Boolean).join(' — '),
    payload: { citation: c.citation, section: c.section, similarity: c.similarity },
    storedAt: c.createdAt,
  };
}

/**
 * Query Tier 1 via pgvector semantic search (primary) with in-memory keyword fallback.
 * When DB + pgvector are available, returns semantically ranked FASB/IFRS/Tax chunks.
 * Falls back to keyword scoring when DB is unavailable.
 */
export async function queryGlobal(
  query: string,
  options?: { topK?: number; framework?: GlobalFramework }
): Promise<MemoryEntry[]> {
  const topK = options?.topK ?? 10;
  const framework: GlobalFramework | undefined = options?.framework;

  // Primary path: pgvector semantic search
  if (isDbConfigured()) {
    try {
      const pool = getPool();
      const pgFramework = framework === 'Tax' ? 'TAX' : framework;
      const chunks = await queryVectorStore(pool, query, {
        topK,
        framework: pgFramework,
        tier: 'tier1_global',
      });
      if (chunks.length > 0) {
        const entries = chunks.map(chunkToMemoryEntry);
        // If no framework filter, also append in-memory Tax keyword matches (Tax may be sparse in pgvector)
        if (!framework) {
          const taxKeyword = keywordScoreAndTake(
            getGlobalEntries().filter((e) => e.source === 'Tax'),
            query,
            Math.max(2, Math.floor(topK / 3))
          );
          for (const t of taxKeyword) {
            if (!entries.find((e) => e.id === t.id)) entries.push(t);
          }
          return entries.slice(0, topK);
        }
        return entries;
      }
      // If pgvector returned 0 results (e.g. table empty / not seeded), fall through to keyword
    } catch (err) {
      log('warn', 'pgvector query failed, falling back to keyword search', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Fallback: in-memory keyword search
  if (framework === 'Tax') {
    return keywordScoreAndTake(getGlobalEntries().filter((e) => e.source === 'Tax'), query, topK);
  }
  return keywordScoreAndTake(getGlobalEntries(), query, topK);
}

function keywordScoreAndTake(entries: MemoryEntry[], query: string, k: number): MemoryEntry[] {
  const q = query.toLowerCase();
  const terms = q.split(/\s+/).filter((t) => t.length > 1);
  const scored = entries
    .map((e) => ({
      entry: e,
      score: terms.reduce((s, t) => (e.text.toLowerCase().includes(t) ? s + 1 : s), 0),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => x.entry);
  if (scored.length === 0) return entries.slice(0, k);
  return scored;
}
