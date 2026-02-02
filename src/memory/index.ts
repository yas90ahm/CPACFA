/**
 * Semantic Memory — Vectorized storage and retrieval for decisions, user corrections, and justifications.
 *
 * Storage: Every major decision, user correction, and justification is vectorized and stored (in-memory by default; optional Pinecone when configured).
 * Retrieval: When a new file is uploaded, the agent can query: "Have I seen this vendor before? How did we categorize it last time?" via lookupVendor() and queryMemory().
 * Consistency: If the agent's logic contradicts a previous user correction, checkConsistency() returns a prompt to ask the user (e.g. "Last month you categorized 'Stripe' as 'Software'; should I continue doing that or use the new 'Merchant Services' category?").
 *
 * Optional: Set OPENAI_API_KEY to use OpenAI embeddings for better semantic similarity. Set PINECONE_API_KEY and install @pinecone-database/pinecone for cloud vector DB (see memory/pinecone_adapter.ts if added).
 */

export type {
  MemoryEntryType,
  SemanticMemoryEntry,
  SemanticMemoryHit,
  ConsistencyCheckResult,
  StoreUserCorrectionInput,
  StoreJustificationInput,
  StoreDecisionInput,
  MemoryPayload,
  VendorCategoryMeta,
  JustificationMeta,
  DecisionMeta,
} from './types.js';

export {
  storeUserCorrection,
  storeJustification,
  storeDecision,
  queryMemory,
  lookupVendor,
  checkConsistency,
  getById,
  listAll,
  clearStore,
} from './semantic_memory.js';

export {
  localEmbed,
  localEmbeddingProvider,
  embed,
  cosineSimilarity,
  setDefaultEmbeddingProvider,
  getDefaultEmbeddingProvider,
} from './embedding.js';
export type { EmbeddingProvider } from './embedding.js';

export {
  getPolicyMemory,
  setPolicyMemory,
  updatePolicyMemory,
} from './policy_memory.js';
export {
  getTransactionCategory,
  setTransactionCategory,
} from './transaction_memory.js';
export type { PolicyMemoryRecord, PolicyMemoryOptions } from './policy_memory.js';
