/**
 * Semantic Memory — Embedding provider abstraction.
 * Supports local pseudo-embedding (no API) and optional OpenAI for real vectors.
 */

const DEFAULT_DIM = 64;

/** Simple hash for strings (deterministic). */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Local pseudo-embedding: text -> fixed-dim vector.
 * Similar text (same words/vendor names) yields similar vectors for cosine similarity.
 * No API required; suitable for in-memory / local FAISS-style retrieval.
 */
export function localEmbed(text: string, dimension: number = DEFAULT_DIM): number[] {
  const vec = new Array<number>(dimension).fill(0);
  const normalized = (text || '').toLowerCase().trim();
  const words = normalized.split(/\s+/).filter((w) => w.length > 0);

  for (const word of words) {
    const idx = hashString(word) % dimension;
    vec[idx] += 1;
  }
  for (let i = 0; i < normalized.length - 2; i++) {
    const trigram = normalized.slice(i, i + 3);
    const idx = (hashString(trigram) % (dimension - 1)) + 1;
    vec[idx] += 0.5;
  }

  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

/**
 * Embedding provider interface (for swapping in OpenAI or other APIs).
 */
export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  dimension(): number;
}

/** Local provider (no API). */
export const localEmbeddingProvider: EmbeddingProvider = {
  async embed(text: string): Promise<number[]> {
    return localEmbed(text, DEFAULT_DIM);
  },
  dimension: () => DEFAULT_DIM,
};

/** Optional OpenAI embedding provider (when OPENAI_API_KEY is set and openai package installed). */
export async function createOpenAIEmbeddingProvider(): Promise<EmbeddingProvider | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const spec: string = 'openai';
    const mod = await import(/* @vite-ignore */ spec).catch(() => null) as { OpenAI?: new (opts: { apiKey: string }) => { embeddings: { create(opts: { model: string; input: string }): Promise<{ data?: { embedding?: number[] }[] }> } } } | null;
    if (!mod?.OpenAI) return null;
    const client = new mod.OpenAI({ apiKey: key });
    const dim = 1536;
    return {
      async embed(text: string): Promise<number[]> {
        const res = await client.embeddings.create({
          model: 'text-embedding-3-small',
          input: text.slice(0, 8000),
        });
        const vec = res.data?.[0]?.embedding;
        if (!vec || !Array.isArray(vec)) throw new Error('OpenAI embedding failed');
        return vec as number[];
      },
      dimension: () => dim,
    };
  } catch {
    return null;
  }
}

/** Default provider: use OpenAI if available, else local. */
let defaultProvider: EmbeddingProvider = localEmbeddingProvider;

export function setDefaultEmbeddingProvider(provider: EmbeddingProvider): void {
  defaultProvider = provider;
}

export function getDefaultEmbeddingProvider(): EmbeddingProvider {
  return defaultProvider;
}

/** Embed using the default provider. */
export async function embed(text: string): Promise<number[]> {
  return defaultProvider.embed(text);
}

/** Cosine similarity between two vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
