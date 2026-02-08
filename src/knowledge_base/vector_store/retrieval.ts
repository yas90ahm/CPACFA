/**
 * RAG Vector Store — Retrieval strategy for Intelligent Context.
 * Tenant-scoped: queries only return chunks for the given tenant.
 * When CPA agent processes an entry, first query for similar precedent in company history.
 * Every cited rule returns document title + page number for citation.
 */

import type { RAGQueryResult, RAGQueryOptions, RAGChunk } from './types.js';
import { query, queryForPrecedent } from './store.js';
import { buildCitations } from './citation.js';

/**
 * Retrieve chunks for a tenant query with optional filters.
 * Returns only chunks for that tenant. Cross-tenant retrieval is impossible.
 */
export function retrieve(
  tenantId: string,
  queryText: string,
  options?: RAGQueryOptions
): RAGQueryResult {
  const topK = options?.topK ?? 10;
  let chunks: RAGChunk[];

  if (options?.preferPrecedent) {
    chunks = queryForPrecedent(tenantId, queryText, {
      topK,
      standardType: options?.standardType,
    });
  } else {
    chunks = query(tenantId, queryText, {
      topK,
      standardType: options?.standardType,
      levelOfAuthority: options?.levelOfAuthority,
    });
  }

  const citations = buildCitations(chunks);
  return {
    query: queryText,
    chunks,
    citations,
  };
}

/**
 * CPA agent: when processing an entry, first check for similar precedent in company history.
 * Returns precedent chunks (if any) for the tenant with full citation.
 */
export function retrievePrecedentForEntry(
  tenantId: string,
  entryDescription: string,
  options?: { topK?: number; standardType?: 'GAAP' | 'IFRS' }
): RAGQueryResult {
  return retrieve(tenantId, entryDescription, {
    preferPrecedent: true,
    topK: options?.topK ?? 5,
    standardType: options?.standardType,
  });
}

/**
 * Format cited rules for bot response: each rule must include document title and page number.
 */
export function formatCitedRulesForBot(result: RAGQueryResult): string {
  if (result.citations.length === 0) return 'No matching precedent or standard found.';
  const lines = result.citations.map((c) => {
    return `- **${c.documentTitle}**, p. ${c.pageNumber} (${c.standardType}, ${c.levelOfAuthority})${c.citationCode ? ` — ${c.citationCode}` : ''}\n  ${c.excerpt.slice(0, 200)}${c.excerpt.length > 200 ? '…' : ''}`;
  });
  return lines.join('\n\n');
}
