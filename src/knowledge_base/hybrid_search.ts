/**
 * Financial Memory — Hybrid Search: keyword + optional semantic across tiers.
 * Used by CPA agent to find how similar invoices were treated (consistency of reporting).
 */

import type { HybridSearchOptions, HybridSearchResult, MemoryEntry, MemoryTier, SimilarInvoicesResult } from './types.js';
import { getGlobalEntries } from './tiers/tier1_global.js';
import { getFirmEntries, findSimilarTreatments } from './tiers/tier2_firm.js';
import { getSessionEntries } from './tiers/tier3_session.js';

/**
 * BM25 scoring for keyword relevance ranking.
 * Replaces naive term-overlap with TF-IDF-inspired scoring.
 * @param query  - the search query
 * @param document - the document text to score against
 * @param avgDocLength - average document length across the corpus
 * @param k1 - term frequency saturation parameter (1.2 is standard)
 * @param b  - document length normalization (0.75 is standard)
 */
function bm25Score(query: string, document: string, avgDocLength: number, k1 = 1.2, b = 0.75): number {
  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  const docTerms = document.toLowerCase().split(/\s+/);
  const docLength = docTerms.length;

  let score = 0;
  for (const term of queryTerms) {
    const tf = docTerms.filter(t => t === term).length;
    if (tf === 0) continue;
    const numerator = tf * (k1 + 1);
    const denominator = tf + k1 * (1 - b + b * (docLength / avgDocLength));
    score += numerator / denominator;
  }
  return score;
}

/** Compute average document length for a set of entries. */
function computeAvgDocLength(entries: { entry: MemoryEntry }[]): number {
  if (entries.length === 0) return 1;
  const totalWords = entries.reduce((sum, { entry }) => sum + entry.text.split(/\s+/).length, 0);
  return totalWords / entries.length;
}

/** Gather entries from selected tiers (optional sessionId for Tier 3). */
function gatherEntries(
  tiers: MemoryTier[],
  sessionId?: string
): { entry: MemoryEntry; tier: MemoryTier }[] {
  const out: { entry: MemoryEntry; tier: MemoryTier }[] = [];
  if (tiers.includes('global')) {
    for (const e of getGlobalEntries()) out.push({ entry: e, tier: 'global' });
  }
  if (tiers.includes('firm')) {
    for (const e of getFirmEntries()) out.push({ entry: e, tier: 'firm' });
  }
  if (tiers.includes('session') && sessionId) {
    for (const e of getSessionEntries(sessionId)) out.push({ entry: e, tier: 'session' });
  }
  return out;
}

/**
 * Hybrid search across tiers: keyword scoring. Optionally restrict to tiers/session.
 */
export function hybridSearch(
  query: string,
  options?: HybridSearchOptions & { sessionId?: string }
): HybridSearchResult[] {
  const tiers = options?.tiers ?? ['global', 'firm', 'session'];
  const topK = options?.topK ?? 20;
  const sessionId = options?.sessionId;

  const pairs = gatherEntries(tiers, sessionId);
  const avgDocLen = computeAvgDocLength(pairs);

  // Hybrid scoring: Tier 1 (global/GAAP) uses semantic similarity when available,
  // Tier 2 (firm) and Tier 3 (session) use BM25 for keyword relevance.
  // Final hybrid: alpha * semantic_score + (1 - alpha) * bm25_score, alpha = 0.6
  const alpha = 0.6;

  const scored: HybridSearchResult[] = pairs
    .map(({ entry, tier }) => {
      const bm25 = bm25Score(query, entry.text, avgDocLen);
      // Semantic score placeholder: when vector similarity is available via payload, use it.
      const semantic = (entry.payload?.['similarity'] as number | undefined) ?? 0;

      // For global tier entries with semantic scores, use hybrid blend.
      // For firm/session tiers, rely on BM25 (semantic = 0).
      const finalScore = tier === 'global' && semantic > 0
        ? alpha * semantic + (1 - alpha) * bm25
        : bm25;

      return {
        entry,
        score: finalScore,
        scoreBreakdown: { keyword: bm25, semantic: semantic > 0 ? semantic : undefined },
        tier,
      };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  return scored;
}

/**
 * Find how similar invoices were treated in previous years — for CPA consistency of reporting.
 * Uses hybrid-style matching on vendor, description, and optional account code.
 */
export function findSimilarInvoiceTreatments(params: {
  query: string;
  vendor?: string;
  description?: string;
  accountCode?: string;
  topK?: number;
}): SimilarInvoicesResult {
  const { query, vendor, description, accountCode, topK = 10 } = params;
  const treatments = findSimilarTreatments({
    vendor: vendor ?? undefined,
    description: description ?? query,
    accountCode,
    topK,
  });

  const consistencyNote =
    treatments.length > 0
      ? `For consistency of reporting, consider treating this invoice similarly: account ${treatments[0].accountCode}${treatments[0].citation ? ` (${treatments[0].citation})` : ''}. Prior period: ${treatments[0].period}.`
      : undefined;

  return {
    query: description ?? query,
    treatments,
    consistencyNote,
  };
}
