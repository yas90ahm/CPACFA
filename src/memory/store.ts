/**
 * Semantic Memory — In-memory vector store (local FAISS-style).
 * Upsert entries with embeddings; query by text (embed + cosine similarity).
 * Optional Pinecone adapter can be used when PINECONE_API_KEY is set.
 */

import type { SemanticMemoryEntry } from './types.js';
import { embed, cosineSimilarity } from './embedding.js';

const entries: SemanticMemoryEntry[] = [];
let idCounter = 0;

function nextId(): string {
  idCounter += 1;
  return `mem-${Date.now()}-${idCounter}`;
}

/**
 * Add or update an entry. If id is provided and exists, update; else insert with new id.
 */
export async function upsert(entry: Omit<SemanticMemoryEntry, 'id'> & { id?: string }): Promise<SemanticMemoryEntry> {
  const vector = entry.embedding.length > 0 ? entry.embedding : await embed(entry.text);
  const id = entry.id ?? nextId();
  const existing = entries.find((e) => e.id === id);
  const record: SemanticMemoryEntry = {
    ...entry,
    id,
    embedding: vector,
    storedAt: entry.storedAt ?? new Date().toISOString(),
  };
  if (existing) {
    const idx = entries.indexOf(existing);
    entries[idx] = record;
  } else {
    entries.push(record);
  }
  return record;
}

/**
 * Query by text: embed the query and return top-k most similar entries.
 */
export async function query(
  queryText: string,
  options?: {
    topK?: number;
    entryTypes?: Array<SemanticMemoryEntry['entryType']>;
    minScore?: number;
  }
): Promise<{ entry: SemanticMemoryEntry; score: number }[]> {
  const topK = options?.topK ?? 10;
  const minScore = options?.minScore ?? 0.3;
  const queryVector = await embed(queryText);
  let list = entries;
  if (options?.entryTypes?.length) {
    const set = new Set(options.entryTypes);
    list = list.filter((e) => set.has(e.entryType));
  }
  const scored = list
    .map((e) => ({ entry: e, score: cosineSimilarity(queryVector, e.embedding) }))
    .filter((x) => x.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  return scored;
}

/**
 * Get entry by id.
 */
export function getById(id: string): SemanticMemoryEntry | undefined {
  return entries.find((e) => e.id === id);
}

/**
 * List all entries (e.g. for admin or export).
 */
export function listAll(): SemanticMemoryEntry[] {
  return [...entries];
}

/**
 * Find user corrections for a vendor (exact or fuzzy by vendor name in payload).
 */
export function findUserCorrectionsByVendor(vendor: string): SemanticMemoryEntry[] {
  const v = vendor.toLowerCase().trim();
  return entries.filter((e) => {
    if (e.entryType !== 'user_correction') return false;
    const payload = e.payload as { type: 'user_correction'; vendorCategory: { vendor: string } };
    return payload.vendorCategory?.vendor?.toLowerCase().includes(v) || v.includes(payload.vendorCategory?.vendor?.toLowerCase() ?? '');
  });
}

/**
 * Clear store (e.g. for tests).
 */
export function clearStore(): void {
  entries.length = 0;
}
