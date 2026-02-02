/**
 * Financial Memory — Hybrid Search: keyword + optional semantic across tiers.
 * Used by CPA agent to find how similar invoices were treated (consistency of reporting).
 */

import type { HybridSearchOptions, HybridSearchResult, MemoryEntry, MemoryTier, SimilarInvoicesResult } from './types.js';
import { getGlobalEntries } from './tiers/tier1_global.js';
import { getFirmEntries, findSimilarTreatments } from './tiers/tier2_firm.js';
import { getSessionEntries } from './tiers/tier3_session.js';

/** Keyword score: term overlap (BM25-style weight: more matches = higher score). */
function keywordScore(text: string, query: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const terms = q.split(/\s+/).filter((w) => w.length > 1);
  let score = 0;
  for (const term of terms) {
    if (t.includes(term)) score += 1;
    if (t.startsWith(term) || t.includes(` ${term}`)) score += 0.5;
  }
  return score;
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
  const scored: HybridSearchResult[] = pairs
    .map(({ entry, tier }) => {
      const keyword = keywordScore(entry.text, query);
      return {
        entry,
        score: keyword,
        scoreBreakdown: { keyword },
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
