/**
 * XBRL Embedding Service — compute and store embeddings for XBRL taxonomy elements.
 *
 * Uses the existing EmbeddingProvider abstraction from memory/embedding.ts.
 * The default local pseudo-embedding is 64-dim; this service stores into the
 * vector(384) column. When a real embedding provider (OpenAI or @xenova/transformers)
 * is configured, embeddings will be 384 or 1536-dim. The DB column vector(384) is
 * used when a 384-dim provider is available; otherwise this service is a no-op stub.
 *
 * TODO: When a production embedding provider is configured (e.g. all-MiniLM-L6-v2
 * via @xenova/transformers producing 384-dim vectors), enable this service to batch-
 * compute embeddings for all non-abstract, non-deprecated elements.
 *
 * For now, the XBRL search service relies on trigram text similarity only.
 */

import type { Pool } from 'pg';
import { getDefaultEmbeddingProvider } from '../memory/embedding.js';
import { log } from '../lib/logger.js';

const BATCH_SIZE = 100;
const TARGET_DIM = 384;

/**
 * Check whether the current embedding provider produces vectors compatible
 * with the xbrl_taxonomy_elements.embedding column (vector(384)).
 */
export function isEmbeddingCompatible(): boolean {
  const provider = getDefaultEmbeddingProvider();
  return provider.dimension() === TARGET_DIM;
}

/**
 * Compute and store embeddings for XBRL elements that don't have one yet.
 * Only runs if the embedding provider dimension matches TARGET_DIM (384).
 * Returns the count of elements updated.
 */
export async function computeXbrlEmbeddings(pool: Pool): Promise<number> {
  if (!isEmbeddingCompatible()) {
    log('info', '[xbrl_embedding] Embedding provider dimension is not 384; skipping embedding computation. Trigram search will be used instead.');
    return 0;
  }

  const provider = getDefaultEmbeddingProvider();
  let totalUpdated = 0;

  // Fetch elements without embeddings in batches
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
        log('warn', `[xbrl_embedding] Failed to embed ${row.id}: ${msg}`);
      }
    }

    log('info', `[xbrl_embedding] Computed ${totalUpdated} embeddings so far...`);
  }

  log('info', `[xbrl_embedding] Done. Total embeddings computed: ${totalUpdated}`);
  return totalUpdated;
}
