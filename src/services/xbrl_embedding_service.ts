/**
 * XBRL Embedding Service — compute and store embeddings for XBRL taxonomy elements.
 *
 * Uses the EmbeddingProvider abstraction from memory/embedding.ts.
 * Stores embeddings in the `embedding` column of xbrl_taxonomy_elements.
 * When embeddings are computed, xbrl_search_service can use them as a
 * secondary signal alongside trigram similarity for better semantic matching.
 */

import type { Pool } from 'pg';
import { getDefaultEmbeddingProvider } from '../memory/embedding.js';

const BATCH_SIZE = 100;

/**
 * Get the dimension of the current embedding provider.
 */
export function getEmbeddingDimension(): number {
  return getDefaultEmbeddingProvider().dimension();
}

/**
 * Compute and store embeddings for XBRL elements that don't have one yet.
 * Adapts to whatever embedding dimension the provider produces.
 * Returns the count of elements updated.
 */
export async function computeXbrlEmbeddings(pool: Pool): Promise<number> {
  const provider = getDefaultEmbeddingProvider();
  const dim = provider.dimension();

  // Ensure the embedding column exists with the right dimension
  try {
    await pool.query(`ALTER TABLE xbrl_taxonomy_elements ADD COLUMN IF NOT EXISTS embedding vector(${dim})`);
  } catch {
    // Column may already exist — if dimension differs, per-row inserts will fail and we'll catch them
  }

  let totalUpdated = 0;

  while (true) {
    const res = await pool.query<{ id: string; label: string; documentation: string | null }>(
      `SELECT id, label, documentation
       FROM xbrl_taxonomy_elements
       WHERE abstract = false AND deprecated = false AND embedding IS NULL
       ORDER BY id
       LIMIT $1`,
      [BATCH_SIZE]
    );

    if (res.rows.length === 0) break;

    for (const row of res.rows) {
      const text = `${row.label}${row.documentation ? '. ' + row.documentation : ''}`;
      try {
        const vec = await provider.embed(text);
        await pool.query(
          `UPDATE xbrl_taxonomy_elements SET embedding = $1::vector WHERE id = $2`,
          [`[${vec.join(',')}]`, row.id]
        );
        totalUpdated++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // If dimension mismatch, stop early — column size doesn't match provider
        if (msg.includes('dimension')) {
          console.warn(`[xbrl_embedding] Dimension mismatch (provider=${dim}). Stopping.`);
          return totalUpdated;
        }
        console.warn(`[xbrl_embedding] Failed to embed ${row.id}: ${msg}`);
      }
    }

    if (totalUpdated % 500 === 0) {
      console.log(`[xbrl_embedding] Computed ${totalUpdated} embeddings so far...`);
    }
  }

  console.log(`[xbrl_embedding] Done. Total: ${totalUpdated}`);
  return totalUpdated;
}

/**
 * Search XBRL elements by embedding similarity (cosine distance via pgvector).
 * Returns empty if no embeddings have been computed.
 */
export async function searchByEmbedding(
  pool: Pool,
  queryText: string,
  options?: { statement?: string; limit?: number }
): Promise<Array<{ id: string; label: string; similarity: number; statement: string }>> {
  const provider = getDefaultEmbeddingProvider();
  const queryVec = await provider.embed(queryText);

  const conditions = ['abstract = false', 'deprecated = false', 'embedding IS NOT NULL'];
  const params: unknown[] = [`[${queryVec.join(',')}]`];
  let paramIdx = 2;

  if (options?.statement) {
    conditions.push(`statement = $${paramIdx}`);
    params.push(options.statement);
    paramIdx++;
  }

  const limit = options?.limit ?? 10;
  params.push(limit);

  try {
    const res = await pool.query<{ id: string; label: string; sim: number; statement: string }>(
      `SELECT id, label, statement, 1 - (embedding <=> $1::vector) AS sim
       FROM xbrl_taxonomy_elements
       WHERE ${conditions.join(' AND ')}
       ORDER BY embedding <=> $1::vector
       LIMIT $${paramIdx}`,
      params
    );
    return res.rows.map(r => ({ id: r.id, label: r.label, similarity: Number(r.sim), statement: r.statement }));
  } catch {
    // Embeddings not available or dimension mismatch — caller falls back to trigram
    return [];
  }
}
