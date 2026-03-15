/**
 * pgvector-backed vector store for GAAP/IFRS semantic search.
 *
 * Uses the existing pg Pool to query knowledge_embeddings table.
 * Embeddings computed via the existing EmbeddingProvider abstraction
 * (local pseudo-embeddings, or OpenAI when available).
 *
 * For production-grade embeddings, set OPENAI_API_KEY for text-embedding-3-small (1536 dim)
 * or install @xenova/transformers for local all-MiniLM-L6-v2 (384 dim).
 */

import type { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { getDefaultEmbeddingProvider, type EmbeddingProvider } from '../../memory/embedding.js';
import { log } from '../../lib/logger.js';

// --- Types ---

export interface VectorChunk {
  id: string;
  tier: string;
  tenantId: string | null;
  sessionId: string | null;
  framework: string | null;
  citation: string;
  section: string | null;
  chunkText: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  similarity?: number;
}

export interface VectorQueryOptions {
  topK?: number;
  framework?: string;
  tier?: string;
  tenantId?: string | null;
  minSimilarity?: number;
}

export interface VectorInsertInput {
  tier?: string;
  tenantId?: string | null;
  sessionId?: string | null;
  framework?: string;
  citation: string;
  section?: string;
  chunkText: string;
  metadata?: Record<string, unknown>;
}

// --- Embedding dimension management ---

let embeddingDim: number | null = null;

/**
 * Get the active embedding dimension. Cached after first call.
 */
function getEmbeddingDim(): number {
  if (embeddingDim == null) {
    embeddingDim = getDefaultEmbeddingProvider().dimension();
  }
  return embeddingDim;
}

/**
 * Reset cached dimension (for testing or provider swaps).
 */
export function resetEmbeddingDimCache(): void {
  embeddingDim = null;
}

// --- Core operations ---

/**
 * Insert a chunk with its embedding into the pgvector store.
 */
export async function insertChunk(
  pool: Pool,
  input: VectorInsertInput,
  provider?: EmbeddingProvider
): Promise<VectorChunk> {
  const p = provider ?? getDefaultEmbeddingProvider();
  const embedding = await p.embed(input.chunkText);
  const id = randomUUID();
  const vecStr = `[${embedding.join(',')}]`;

  await pool.query(
    `INSERT INTO knowledge_embeddings (id, tier, tenant_id, session_id, framework, citation, section, chunk_text, embedding, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::vector, $10)`,
    [
      id,
      input.tier ?? 'tier1_global',
      input.tenantId ?? null,
      input.sessionId ?? null,
      input.framework ?? null,
      input.citation,
      input.section ?? null,
      input.chunkText,
      vecStr,
      JSON.stringify(input.metadata ?? {}),
    ]
  );

  return {
    id,
    tier: input.tier ?? 'tier1_global',
    tenantId: input.tenantId ?? null,
    sessionId: input.sessionId ?? null,
    framework: input.framework ?? null,
    citation: input.citation,
    section: input.section ?? null,
    chunkText: input.chunkText,
    metadata: input.metadata ?? {},
    createdAt: new Date().toISOString(),
  };
}

/**
 * Batch insert multiple chunks with embeddings.
 */
export async function insertChunksBatch(
  pool: Pool,
  inputs: VectorInsertInput[],
  provider?: EmbeddingProvider
): Promise<number> {
  const p = provider ?? getDefaultEmbeddingProvider();
  let inserted = 0;

  for (const input of inputs) {
    try {
      await insertChunk(pool, input, p);
      inserted++;
    } catch (err) {
      log('warn', 'Failed to insert chunk', {
        citation: input.citation,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return inserted;
}

/**
 * Query the vector store using cosine similarity.
 * Returns chunks ranked by similarity to the query text.
 */
export async function queryVectorStore(
  pool: Pool,
  queryText: string,
  options?: VectorQueryOptions,
  provider?: EmbeddingProvider
): Promise<VectorChunk[]> {
  const p = provider ?? getDefaultEmbeddingProvider();
  const topK = options?.topK ?? 5;
  const minSimilarity = options?.minSimilarity ?? 0.0;

  const queryEmbedding = await p.embed(queryText);
  const vecStr = `[${queryEmbedding.join(',')}]`;

  // Build WHERE clause for filters
  const conditions: string[] = [];
  const params: unknown[] = [vecStr, topK];
  let paramIdx = 3;

  if (options?.framework) {
    conditions.push(`framework = $${paramIdx}`);
    params.push(options.framework);
    paramIdx++;
  }
  if (options?.tier) {
    conditions.push(`tier = $${paramIdx}`);
    params.push(options.tier);
    paramIdx++;
  }
  if (options?.tenantId !== undefined) {
    if (options.tenantId === null) {
      conditions.push('tenant_id IS NULL');
    } else {
      conditions.push(`tenant_id = $${paramIdx}`);
      params.push(options.tenantId);
      paramIdx++;
    }
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const sql = `
    SELECT id, tier, tenant_id, session_id, framework, citation, section, chunk_text,
           metadata, created_at,
           1 - (embedding <=> $1::vector) AS similarity
    FROM knowledge_embeddings
    ${whereClause}
    ORDER BY embedding <=> $1::vector
    LIMIT $2
  `;

  try {
    const { rows } = await pool.query(sql, params);
    return rows
      .filter((r: Record<string, unknown>) => Number(r.similarity) >= minSimilarity)
      .map((r: Record<string, unknown>) => ({
        id: String(r.id),
        tier: String(r.tier),
        tenantId: r.tenant_id as string | null,
        sessionId: r.session_id as string | null,
        framework: r.framework as string | null,
        citation: String(r.citation),
        section: r.section as string | null,
        chunkText: String(r.chunk_text),
        metadata: (r.metadata as Record<string, unknown>) ?? {},
        createdAt: String(r.created_at),
        similarity: Number(r.similarity),
      }));
  } catch (err) {
    log('error', 'Vector store query failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Count chunks in the store, optionally filtered.
 */
export async function countChunks(
  pool: Pool,
  options?: { tier?: string; framework?: string; tenantId?: string | null }
): Promise<number> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (options?.tier) {
    conditions.push(`tier = $${idx++}`);
    params.push(options.tier);
  }
  if (options?.framework) {
    conditions.push(`framework = $${idx++}`);
    params.push(options.framework);
  }
  if (options?.tenantId !== undefined) {
    if (options.tenantId === null) {
      conditions.push('tenant_id IS NULL');
    } else {
      conditions.push(`tenant_id = $${idx++}`);
      params.push(options.tenantId);
    }
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS count FROM knowledge_embeddings ${where}`, params);
  return rows[0]?.count ?? 0;
}

/**
 * Delete all chunks matching filters (for re-seeding).
 */
export async function deleteChunks(
  pool: Pool,
  options: { tier?: string; framework?: string; tenantId?: string | null }
): Promise<number> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (options.tier) {
    conditions.push(`tier = $${idx++}`);
    params.push(options.tier);
  }
  if (options.framework) {
    conditions.push(`framework = $${idx++}`);
    params.push(options.framework);
  }
  if (options.tenantId !== undefined) {
    if (options.tenantId === null) {
      conditions.push('tenant_id IS NULL');
    } else {
      conditions.push(`tenant_id = $${idx++}`);
      params.push(options.tenantId);
    }
  }

  if (conditions.length === 0) return 0; // Safety: don't delete everything

  const where = `WHERE ${conditions.join(' AND ')}`;
  const result = await pool.query(`DELETE FROM knowledge_embeddings ${where}`, params);
  return result.rowCount ?? 0;
}
