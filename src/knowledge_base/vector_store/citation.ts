/**
 * RAG Vector Store — Citation formatting.
 * Force the bot to return specific page number and document title for every rule cited.
 */

import type { RAGChunk, ChunkCitation } from './types.js';

/**
 * Build a citation object for a chunk (document title + page number required).
 */
export function formatCitation(chunk: RAGChunk): ChunkCitation {
  return {
    documentTitle: chunk.documentTitle,
    pageNumber: chunk.pageNumber,
    standardType: chunk.standardType,
    levelOfAuthority: chunk.levelOfAuthority,
    citationCode: chunk.citationCode,
    excerpt: chunk.text.slice(0, 500) + (chunk.text.length > 500 ? '…' : ''),
    chunkId: chunk.id,
  };
}

/**
 * Format citation as a short string for inline use (e.g. "[FASB ASC 606, p. 12]").
 */
export function formatCitationShort(chunk: RAGChunk): string {
  const code = chunk.citationCode ? ` ${chunk.citationCode}` : '';
  return `[${chunk.documentTitle}${code}, p. ${chunk.pageNumber}]`;
}

/**
 * Format citation for bot response: full line that must accompany every cited rule.
 * Ensures document title and page number are always returned.
 */
export function formatCitationForResponse(citation: ChunkCitation): string {
  const parts = [
    `**Document:** ${citation.documentTitle}`,
    `**Page:** ${citation.pageNumber}`,
    `**Standard:** ${citation.standardType}`,
    `**Authority:** ${citation.levelOfAuthority}`,
  ];
  if (citation.citationCode) parts.push(`**Citation:** ${citation.citationCode}`);
  parts.push(`**Excerpt:** ${citation.excerpt}`);
  return parts.join('\n');
}

/**
 * Build citations array from chunks (for RAG query result).
 */
export function buildCitations(chunks: RAGChunk[]): ChunkCitation[] {
  return chunks.map(formatCitation);
}
