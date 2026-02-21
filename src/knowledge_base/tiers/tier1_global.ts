/**
 * Financial Memory — Tier 1 (Global): FASB, IFRS, and Tax Codes.
 * Integrates with existing RAG handbook and adds Tax chunks.
 */

import type { MemoryEntry } from '../types.js';
// QUARANTINED — rag_handbook not in MVP architecture
// import { getDefaultRAGStore, getHandbookChunks } from '../../services/rag_handbook.js';

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

/** Query Tier 1 via existing RAG store (FASB/IFRS) and append Tax matches by keyword. */
export async function queryGlobal(
  query: string,
  options?: { topK?: number; framework?: GlobalFramework }
): Promise<MemoryEntry[]> {
  const topK = options?.topK ?? 10;
  const framework: GlobalFramework | undefined = options?.framework;

  if (framework === 'Tax') {
    const taxOnly = getGlobalEntries().filter((e) => e.source === 'Tax');
    return keywordScoreAndTake(taxOnly, query, topK);
  }

  // QUARANTINED — rag_handbook not in MVP architecture
  // const store = getDefaultRAGStore();
  // const result = await store.query(query, {
  //   topK,
  //   framework: framework === 'FASB' || framework === 'IFRS' ? framework : undefined,
  // });
  const result = { chunks: [], query: query };
  const fromRag = result.chunks.map((c: any) => ({
    id: c.id,
    tier: 'global' as const,
    source: c.framework,
    text: [c.citation, c.section, c.text].filter(Boolean).join(' — '),
    payload: { citation: c.citation, section: c.section },
    storedAt: new Date().toISOString(),
  }));

  if (framework) return fromRag;
  const taxMatches = keywordScoreAndTake(
    getGlobalEntries().filter((e) => e.source === 'Tax'),
    query,
    Math.max(2, Math.floor(topK / 3))
  );
  const combined: MemoryEntry[] = [...fromRag];
  for (const t of taxMatches) {
    if (!combined.find((c) => c.id === t.id)) combined.push(t);
  }
  return combined.slice(0, topK);
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
