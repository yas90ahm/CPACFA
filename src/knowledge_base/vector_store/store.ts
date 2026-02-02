/**
 * RAG Vector Store — In-memory store with metadata tagging.
 * Every chunk tagged by Standard Type (GAAP vs IFRS) and Level of Authority.
 */

import type { RAGChunk, IngestChunkInput, StandardType, LevelOfAuthority } from './types.js';

const chunks: RAGChunk[] = [];
let idCounter = 0;

function nextId(): string {
  idCounter += 1;
  return `vs-${Date.now()}-${idCounter}`;
}

function keywordScore(chunk: RAGChunk, query: string): number {
  const q = query.toLowerCase();
  const text = (chunk.text + ' ' + (chunk.citationCode ?? '') + ' ' + chunk.documentTitle).toLowerCase();
  const terms = q.split(/\s+/).filter((t) => t.length > 1);
  let score = 0;
  for (const t of terms) {
    if (text.includes(t)) score += 1;
    if (chunk.citationCode?.toLowerCase().includes(t)) score += 2;
  }
  return score;
}

/**
 * Add a single chunk to the store.
 */
export function addChunk(input: IngestChunkInput): RAGChunk {
  const id = nextId();
  const chunk: RAGChunk = {
    id,
    text: input.text,
    documentTitle: input.documentTitle,
    pageNumber: input.pageNumber,
    standardType: input.standardType,
    levelOfAuthority: input.levelOfAuthority,
    citationCode: input.citationCode,
    sourceDocumentId: input.sourceDocumentId,
    ingestedAt: new Date().toISOString(),
  };
  chunks.push(chunk);
  return chunk;
}

/**
 * Add multiple chunks.
 */
export function addChunks(inputs: IngestChunkInput[]): RAGChunk[] {
  return inputs.map((i) => addChunk(i));
}

/**
 * Query the store: keyword scoring, optional filter by standard type and level of authority.
 * Returns chunks sorted by score (no vector embeddings; use keyword match).
 */
export function query(
  queryText: string,
  options?: { topK?: number; standardType?: StandardType; levelOfAuthority?: LevelOfAuthority }
): RAGChunk[] {
  const topK = options?.topK ?? 10;
  let list = chunks;
  if (options?.standardType) list = list.filter((c) => c.standardType === options.standardType);
  if (options?.levelOfAuthority) list = list.filter((c) => c.levelOfAuthority === options.levelOfAuthority);
  const scored = list
    .map((c) => ({ chunk: c, score: keywordScore(c, queryText) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((x) => x.chunk);
  return scored;
}

/**
 * Query for similar precedent (company history / internal control).
 * When CPA agent processes an entry, query this first for similar precedent.
 */
export function queryForPrecedent(
  queryText: string,
  options?: { topK?: number; standardType?: StandardType }
): RAGChunk[] {
  const topK = options?.topK ?? 10;
  const precedentChunks = chunks.filter(
    (c) => c.levelOfAuthority === 'precedent' || c.levelOfAuthority === 'company_policy'
  );
  const scored = precedentChunks
    .map((c) => ({ chunk: c, score: keywordScore(c, queryText) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((x) => x.chunk);
  if (scored.length > 0) return scored;
  const fallback = query(queryText, { ...options, levelOfAuthority: 'company_policy' });
  return fallback.length > 0 ? fallback : query(queryText, { topK });
}

/**
 * Get chunk by id.
 */
export function getById(id: string): RAGChunk | undefined {
  return chunks.find((c) => c.id === id);
}

/**
 * List all chunks (e.g. for admin).
 */
export function listChunks(): RAGChunk[] {
  return [...chunks];
}

/**
 * Clear store (e.g. for tests).
 */
export function clearStore(): void {
  chunks.length = 0;
}
