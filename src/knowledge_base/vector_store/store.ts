/**
 * RAG Vector Store — In-memory store with metadata tagging.
 * Tenant-scoped: chunks are namespaced by tenantId to prevent cross-tenant retrieval.
 * Every chunk tagged by Standard Type (GAAP vs IFRS) and Level of Authority.
 */

import type { RAGChunk, IngestChunkInput, StandardType, LevelOfAuthority } from './types.js';

/** Default tenant when no tenant present and auth disabled (dev only). Never used in production. */
export const DEFAULT_TENANT_ID = '__dev_default';

/** Resolve tenantId: use provided, or fallback to dev default only when auth disabled and not production. */
export function resolveTenantId(tenantId: string | undefined): string {
  if (tenantId && tenantId.trim()) return tenantId.trim();
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Vector store requires tenantId in production. Authenticate with a valid token.');
  }
  return DEFAULT_TENANT_ID;
}

/** Per-tenant chunk storage. tenantId -> chunks[]. */
const chunksByTenant = new Map<string, RAGChunk[]>();
let idCounter = 0;

function nextId(): string {
  idCounter += 1;
  return `vs-${Date.now()}-${idCounter}`;
}

function getChunksForTenant(tenantId: string): RAGChunk[] {
  let arr = chunksByTenant.get(tenantId);
  if (!arr) {
    arr = [];
    chunksByTenant.set(tenantId, arr);
  }
  return arr;
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
 * Add a single chunk to the store for the given tenant.
 */
export function addChunk(tenantId: string, input: IngestChunkInput): RAGChunk {
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
  const chunks = getChunksForTenant(tenantId);
  chunks.push(chunk);
  return chunk;
}

/**
 * Add multiple chunks for the given tenant.
 */
export function addChunks(tenantId: string, inputs: IngestChunkInput[]): RAGChunk[] {
  return inputs.map((i) => addChunk(tenantId, i));
}

/**
 * Query the store for a tenant: keyword scoring, optional filter by standard type and level of authority.
 * Returns only chunks for that tenant. Cross-tenant retrieval is impossible.
 */
export function query(
  tenantId: string,
  queryText: string,
  options?: { topK?: number; standardType?: StandardType; levelOfAuthority?: LevelOfAuthority }
): RAGChunk[] {
  const topK = options?.topK ?? 10;
  const chunks = getChunksForTenant(tenantId);
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
 * Query for similar precedent (company history / internal control) for a tenant.
 */
export function queryForPrecedent(
  tenantId: string,
  queryText: string,
  options?: { topK?: number; standardType?: StandardType }
): RAGChunk[] {
  const topK = options?.topK ?? 10;
  const chunks = getChunksForTenant(tenantId);
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
  const fallback = query(tenantId, queryText, { ...options, levelOfAuthority: 'company_policy' });
  return fallback.length > 0 ? fallback : query(tenantId, queryText, { topK });
}

/**
 * Get chunk by id within a tenant. Returns undefined if not found or belongs to another tenant.
 */
export function getById(tenantId: string, id: string): RAGChunk | undefined {
  const chunks = getChunksForTenant(tenantId);
  return chunks.find((c) => c.id === id);
}

/**
 * List all chunks for a tenant.
 */
export function listChunks(tenantId: string): RAGChunk[] {
  return [...getChunksForTenant(tenantId)];
}

/**
 * Clear chunks for a single tenant.
 */
export function clearTenant(tenantId: string): void {
  chunksByTenant.delete(tenantId);
}

/**
 * Clear entire store (all tenants). For tests only.
 */
export function clearStore(): void {
  chunksByTenant.clear();
}
